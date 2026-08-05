# Razorpay Subscription & Billing System Plan

## Context (Current State)

- **Architecture**: Next.js static export (`output: 'export'` → `out/`) served by Cloudflare Worker "Workers with Assets". All API = Hono routes in `src/routes/*`, D1 database, KV for sessions/secrets. Frontend API calls via `fetch('/api/...')`.
- **Existing**: `plans` table (name, description, upfront_price, pay_as_you_go_rate, features_json, limits_json), `workspaces.plan_id` FK, public `GET /api/plans` (miscRoutes.ts:302, auto-seeds 3 default plans), admin plans CRUD (`/api/admin/plans`, admin.ts:312-380), `/pricing` page (buttons sirf `/register` par le jaate hain), admin page plans tab.
- **Missing**: payment/subscription flow, Razorpay, billing UI, plan enforcement, free plan assignment.
- **No razorpay npm package installed** — use Razorpay REST API via `fetch` (lighter, Worker-friendly). Base URL `https://api.razorpay.com/v1`, Basic Auth `key_id:key_secret`. All amounts in **paise** (integer).

## Decisions (user-approved)

1. **Payment model**: Per-plan `billing_type` — `recurring` (Razorpay Subscriptions API, auto-charge) AND `one_time` (Razorpay Orders API, manual).
2. **Currency**: Per-plan `currency` column, default `'INR'`. Pricing page ₹/$ symbol usi se.
3. **Improvements included**: (a) Free plan auto-assign on workspace creation, (b) Dashboard Plan & Billing section, (c) Pricing page fix (currency, login-aware buy, success/cancel states), (d) Plan enforcement + auto-downgrade on expiry.

## 1. Database Migration — `db_migrations/0017_subscriptions_razorpay.sql`

**plans — new columns** (SQLite `ALTER TABLE ADD COLUMN`; schema.sql mein bhi update karna zaroori — admin `/migrate` tool schema.sql diff se chalta hai):

```sql
ALTER TABLE plans ADD COLUMN billing_type TEXT DEFAULT 'recurring';   -- 'recurring' | 'one_time'
ALTER TABLE plans ADD COLUMN billing_period TEXT DEFAULT 'monthly';   -- 'monthly' | 'yearly' | 'weekly' | 'daily'
ALTER TABLE plans ADD COLUMN billing_interval INTEGER DEFAULT 1;
ALTER TABLE plans ADD COLUMN currency TEXT DEFAULT 'INR';
ALTER TABLE plans ADD COLUMN is_active INTEGER DEFAULT 1;
ALTER TABLE plans ADD COLUMN is_free INTEGER DEFAULT 0;               -- free plan = is_free 1
ALTER TABLE plans ADD COLUMN razorpay_plan_id TEXT;
ALTER TABLE plans ADD COLUMN sort_order INTEGER DEFAULT 0;
```

**New tables:**

```sql
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  razorpay_subscription_id TEXT,
  razorpay_plan_id TEXT,
  billing_type TEXT NOT NULL DEFAULT 'recurring',
  status TEXT NOT NULL DEFAULT 'created',  -- created|authenticated|active|past_due|paused|completed|cancelled|expired
  amount REAL DEFAULT 0,
  currency TEXT DEFAULT 'INR',
  current_period_start INTEGER,
  current_period_end INTEGER,              -- unix seconds
  cancel_at_period_end INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_workspace ON subscriptions(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_period ON subscriptions(status, current_period_end);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  subscription_id TEXT,
  razorpay_payment_id TEXT UNIQUE,
  razorpay_order_id TEXT,
  razorpay_subscription_id TEXT,
  amount REAL DEFAULT 0,
  currency TEXT DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'captured',  -- captured|failed|refunded|pending
  method TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payments_workspace ON payments(workspace_id, created_at);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  razorpay_event_id TEXT UNIQUE NOT NULL,  -- idempotency
  event_type TEXT NOT NULL,
  payload_json TEXT,
  processed INTEGER DEFAULT 1,
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Migration mein backfill bhi: `UPDATE workspaces SET plan_id = (SELECT id FROM plans WHERE is_free = 1 LIMIT 1) WHERE plan_id IS NULL AND EXISTS (SELECT 1 FROM plans WHERE is_free = 1);` — is_free 1 wala plan pehle seed karo (free/starter demo plan admin UI se ya SQL se).

## 2. Backend

### 2a. `src/services/razorpay.ts` (new) — Razorpay API wrapper
- `getRazorpayKeys(env)` → KV se `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`; missing ho to throw config error.
- `razorpayRequest(env, path, method, body?)` — fetch + Basic Auth + JSON.
- `createRazorpayPlan(env, plan)` — `POST /plans` `{period, interval, item:{name, amount: Math.round(price*100), currency}}`; plan update hone par `PUT /plans/:id` se refresh (amount change ke liye). Return `id`.
- `createOrder(env, plan, workspaceId)` — `POST /orders` `{amount, currency, receipt, notes:{workspace_id, plan_id}}`.
- `createSubscription(env, plan, workspaceId)` — `POST /subscriptions` `{plan_id, customer_notify:1, total_count:0 (billing until cancelled), notes:{workspace_id, plan_id}}`.
- `verifyPaymentSignature(keySecret, payload, signature)` — HMAC-SHA256; one-time: `{order_id}|{payment_id}`; recurring: `{payment_id}|{subscription_id}`.
- `verifyWebhookSignature(webhookSecret, rawBody, signature)` — HMAC-SHA256 of raw body, hex compare.
- `fetchSubscription(env, id)` — `GET /subscriptions/:id` (period start/end, status).
- `cancelSubscription(env, id)` — `POST /subscriptions/:id/cancel?cancel_at_cycle_end=1`.

### 2b. `src/routes/billingRoutes.ts` (new) — Hono router
Register in `src/index.ts`: `app.use('/api/billing/*', authMiddleware)` (webhook ke alawa), `app.route('/', billingRoutes)`.

- `POST /api/billing/subscribe` (auth) — body `{plan_id, workspace_id}`. Validation: plan exists, `is_active=1`, workspace membership check (authMiddleware already karta hai via x-workspace-id), workspace par active/authenticated subscription nahi honi chahiye (active ho to 400 error + `{cancelExisting: true}`). Billing type ke hisaab se Razorpay subscription/order banaye, DB mein subscription row (`status='created'`) insert kare. Response: `{key_id, subscription_id | order_id, name, amount, currency, prefill:{email, name}, plan_id}`.
- `POST /api/billing/verify` (auth) — body `{razorpay_payment_id, razorpay_subscription_id?, razorpay_order_id?, razorpay_signature, subscription_id}` (subscription_id = hamara DB row id). Signature verify (recurring: payment_id|subscription_id; one-time: order_id|payment_id). Verify fail → 400. Success → Razorpay se subscription fetch (recurring) → DB update: status `active`, `current_period_start/end`, payments row insert (`razorpay_payment_id`), `workspaces.plan_id = plan_id`. One-time ke liye `current_period_end = now + plan.billing_period` (billing_period from plan; default monthly → 30 din). Response `{success: true, plan_id}`.
- `GET /api/billing/subscription` (auth) — query `?workspace_id=` → workspace ka current subscription (status active/authenticated/past_due) + plan info + free plan fallback. `{subscription, plan}`.
- `GET /api/billing/payments` (auth) — payments history (last 50) workspace ke liye.
- `POST /api/billing/cancel` (auth, owner role) — body `{subscription_id}` → Razorpay cancel at cycle end + DB `cancel_at_period_end=1`.
- `POST /api/billing/webhook` (public, NO authMiddleware) — raw body `await c.req.text()`; KV se `RAZORPAY_WEBHOOK_SECRET`; `X-Razorpay-Signature` verify; fail → 400. `razorpay_event_id` se idempotency check (webhook_events). Event handling:
  - `subscription.activated` / `subscription.charged` → subscription `active`, period start/end update, `workspaces.plan_id` set (charged par payment row bhi).
  - `subscription.completed` / `subscription.cancelled` → status update; completed → workspace downgrade free plan.
  - `subscription.paused` / `past_due` → status update.
  - `payment.captured` → payments row (INSERT OR IGNORE by payment id) + subscription activate.
  - `payment.failed` → status `past_due` (recurring), payment row `failed`.
  - Event insert `webhook_events` (UNIQUE razorpay_event_id) → duplicate drop.

### 2c. Free plan auto-assign
- Helper `getFreePlanId(env)` — DB se `SELECT id FROM plans WHERE is_free = 1 LIMIT 1`; KV `FREE_PLAN_ID` cache (optional).
- **authRoutes.ts:verify-otp** — workspace create ke dono paths (line ~234, ~247) mein `INSERT INTO workspaces (id, name, plan_id)` mein free plan id pass karo.
- **admin.ts POST /workspaces** (line ~260) — same.

### 2d. Expiry enforcement + downgrade (cron)
- `src/services/subscriptionCron.ts` (new) — `expireSubscriptions(env)`: active subscriptions jahan `current_period_end < unix_now` AND (`billing_type='one_time'` OR `cancel_at_period_end=1` OR `status='completed'`) → status `expired`, workspace `plan_id` → free plan.
- `src/index.ts` `scheduled()` (line ~681) — `runDomainMaintenance` ke saath `expireSubscriptions` bhi call karo (existing */10 min cron hi kaafi).
- `getWorkspacePlanLimits` (shared.ts:138) already workspace.plan_id → limits_json use karta hai — expiry par free plan set hone se email quota/domain limits auto-enforce ho jayengi. No change needed.

### 2e. Admin routes (admin.ts)
- plans GET/POST/PUT/DELETE mein naye fields (billing_type, billing_period, billing_interval, currency, is_active, is_free, sort_order) — CREATE/UPDATE par recurring plans ke liye Razorpay plan sync (createRazorpayPlan / PUT).
- `GET /api/admin/subscriptions` (new) — all subscriptions + workspace + plan join (admin overview ke liye).

## 3. Frontend

### 3a. Pricing page fix — `app/pricing/page.tsx`
- Currency symbol map (`INR→₹`, `USD→$`, default ₹) — `upfront_price` display ₹ mein, `pay_as_you_go_rate`/message bhi.
- `isPopular` ab `i===1` nahi — plan property se (admin set kare, `sort_order` se fallback).
- Buy flow: mount par `fetch('/api/auth/me')` → logged-in check. "Subscribe" click:
  - Not logged in → `router.push('/login?next=/pricing')`.
  - Logged in → `POST /api/billing/subscribe` (headers: x-workspace-id from localStorage) → response par Razorpay Checkout script (`https://checkout.razorpay.com/v1/checkout.js`) dynamically load → `new Razorpay({key, subscription_id|order_id, name, description, amount, currency, prefill, notes, handler, modal:{ondismiss}})` → `handler` mein `/api/billing/verify` call → success → `/pricing?status=success`; `ondismiss`/`payment.failed` event → `/pricing?status=failed`.
  - `?status=success|cancelled|failed` query par banner (success: green, failed: red, "payment pending support contact").
  - Free plan (`upfront_price===0 && is_free`) par direct subscribe button → verify flow skip nahi — bina payment ke `POST /api/billing/verify` ka variant nahi; instead free plan ke liye direct activate endpoint chhota sa: `POST /api/billing/subscribe` free plan ho to order ke bina direct activate kare (backend mein handle).
- 400 `cancelExisting` error → user ko message: "पहले से active subscription hai — Dashboard mein cancel karein".

### 3b. Dashboard Plan & Billing — SettingsView (app/dashboard/components/SettingsView.tsx)
- Naya section "Plan & Billing": current plan name, status badge, period end date, amount/currency.
- Actions: "Upgrade" (→ /pricing), "Cancel Subscription" (confirm → POST /api/billing/cancel → refresh).
- "Payment History" table (payments: date, amount, currency, status, method) via `GET /api/billing/payments` (x-workspace-id header).
- Data source: `GET /api/billing/subscription?workspace_id=`.

### 3c. Admin page — `app/admin/page.tsx`
- Plans form/modal mein naye fields (billing type dropdown, period, interval, currency, is_active, is_free, sort_order).
- (Optional) "Subscriptions" tab — list via `/api/admin/subscriptions`.

## 4. Secrets / Config (KV — SECRETS_KV)
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` — production KV + local (`wrangler secret put` ya dev KV). `.env.example` mein document karo.
- Test mode: Razorpay dashboard se test keys (`rzp_test_...`) pehle, live baad mein.
- Frontend ko key_id API response se milta hai (static export mein env inline issue nahi).

## 5. Validation

1. `npm run lint` aur `npm run test` (vitest) — naye tests: `tests/razorpay.test.ts` — signature verification (known HMAC vectors), amount→paise conversion, webhook idempotency logic (mock D1), one-time vs recurring branch.
2. Local dev: `npm run dev` (wrangler dev) → pricing page → test key se checkout (Razorpay test card 4111 1111 1111 1111) → verify → dashboard billing section.
3. Webhook: Razorpay dashboard se test webhook send (ya curl X-Razorpay-Signature ke saath) → subscription activate + idempotency check.
4. Expiry: cron simulate (subscription current_period_end past karke) → downgrade free plan check.
5. `npm run build` (static export sahi bane), migration deploy: `npx wrangler d1 migrations apply dhitantra_db_prod --remote`.
6. **schema.sql update** — `plans` naye columns + 3 naye tables (admin `/migrate` + `/schema-diff` tools isi par depend karte hain).

## 6. Risks / Edge Cases

- **Amount precision**: `Math.round(price * 100)` paise mein — 2-decimal currencies only (INR/USD). limits_json wale existing plans (0015) aur seed plans: `is_free` flag free plan par lagana zaroori.
- **Existing seed plans** (miscRoutes.ts:314): default `billing_type='recurring'`, `billing_period='monthly'`, `currency='INR'` seed karo — otherwise pricing page ₹ mein galat display.
- **Razorpay plan amount update**: amount change par Razorpay `PUT /plans/:id` se sync (ya naya plan id save).
- **Double subscribe**: active subscription ho to 400 `{cancelExisting:true}`; cancel API hi rasta hai.
- **Webhook signature**: raw body verify zaroori (Hono mein `c.req.text()` se — json() ke baad raw body nahi milega).
- **KV secrets missing** → `/api/billing/*` clear error message ("Razorpay configured nahi") 500 nahi.
- **Upgrade mid-cycle**: out of scope (v1 mein cancel + naya subscribe). Plan file mein note.
- **Refunds**: payment.status `refunded` webhook (`payment.refunded`) — payment row update; out of scope v1 (note).

## 7. Out of Scope (v1)

- Mid-cycle proration / instant upgrade switch.
- Refund auto-processing, invoices PDF, GST receipts.
- Razorpay Dashboard analytics integration.
- Trial period logic.
