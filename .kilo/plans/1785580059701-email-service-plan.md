# Email Service — Cloudflare Email Sending + Custom Domains (DheeTantra)

## Goal

Multi-tenant email service where each workspace can:
1. **Add its own domain** (`POST /api/domains`) — domain gets onboarded to DheeTantra's Cloudflare account as a zone (Full nameserver setup **or** CNAME/DNS-only setup), Email Routing enabled, DNS records (MX/SPF/DKIM/DMARC) created, and a catch-all routing rule pointing incoming mail to the DheeTantra worker's `email()` handler.
2. **Send email** from any mailbox on a verified domain via the `EMAIL_SENDER` (send_email) binding — structured `send()` API.
3. **Receive email** — incoming mail lands in D1 as `platform='email'` conversations and is broadcast to the inbox via `CHAT_DO`.
4. **Manage** mailboxes, templates (existing `email_templates`), and view send logs, all from a new dashboard tab.

## Context (verified in code)

- Stack: Cloudflare Workers with Assets (`src/index.ts`, Hono), D1 (`DB`), KV (`SECRETS_KV`), R2, `CHAT_DO`, `EMAIL_SENDER` binding already in `wrangler.toml` (line 116-117), `email()` handler stub at `src/index.ts:3548`.
- Tables already exist: `domains`, `domain_emails`, `email_templates` (`schema.sql:225-267`). Partial routes exist: `POST /api/domains` (DB row only, no Cloudflare API), `POST/GET /api/email-templates`, `GET /api/domain-emails/:domainId` (`src/index.ts:1456-1521`). Auth middleware already covers `/api/domains*`, `/api/email-templates*`, `/api/domain-emails/*`.
- Existing send pattern (OTP): `new EmailMessage(sender, email, rawMime)` + `EMAIL_SENDER.send()` — `src/index.ts:424-441`. Replace/upgrade with structured API where convenient.
- Dashboard is a single monolith tab-switcher (`app/dashboard/page.tsx`, `activeTab` union at line 14, nav at 432-448, view switch at 514-538). External view components exist (`components/ActiveConversationsView.tsx`).
- Migrations dir `db_migrations/`, applied with `wrangler d1 migrations apply dhitantra_db_prod --remote`.
- API secrets pattern: KV keys in `SECRETS_KV` (GEMINI_API_KEY, FB_APP_ID, etc.). `.env.example` already lists `CLOUDFLARE_API_TOKEN`.

## Key Cloudflare constraints (from official docs)

- **send_email binding can only send From addresses on domains in DheeTantra's Cloudflare account** with Email Routing enabled/onboarded. Hence user domains are created as zones in DheeTantra's account. Full setup = user changes nameservers (Cloudflare auto-adds all DNS). CNAME setup = Cloudflare gives records (CNAME + TXT, then MX/SPF/DKIM) user adds at their DNS provider; requires account with partial/CNAME-zone support (Business+ plan — verify; if unavailable, keep Full mode only and hide CNAME option).
- Email Routing DNS records: MX `@` → `route1/2/3.mx.cloudflare.net`, SPF TXT `@` `v=spf1 include:_spf.mx.cloudflare.net ~all`, DKIM TXT `cf2024-1._domainkey`. Email Sending uses its own records on `cf-bounce.<domain>` + DMARC `_dmarc`.
- **Sending requirement (verify at implementation):** send_email binding errors `E_SENDER_NOT_VERIFIED` / `E_SENDER_DOMAIN_NOT_AVAILABLE` until the domain is onboarded for sending. Check whether Email Sending onboarding has a REST API (`/accounts/{account_id}/email-service/...`); if not, document a one-time manual dashboard onboarding (Compute > Email Service > Email Sending > Onboard Domain) and detect readiness by sending a test email. Email Routing onboarding IS automatable (`/zones/{id}/email/routing/*` endpoints).
- Limits: structured `send()` = max 50 recipients, 32 attachments, 5 MiB total; daily/rate limits return `E_DAILY_LIMIT_EXCEEDED` / `E_RATE_LIMIT_EXCEEDED` (see limits page; sending requires Workers Paid plan — OTP sending already works, so plan is likely already paid).
- Workers with Assets + `email()` handler in one script: existing stub implies intended; verify `wrangler dev`/deploy accepts both. **Fallback:** separate `wrangler.email.toml` with a dedicated email worker sharing D1/KV/R2 bindings.

## Design decisions (resolved with user)

- **Setup modes: both.** Full (default, recommended) + CNAME (advanced, shown only if account supports partial zones).
- **Incoming + Outbound both in scope.** Incoming mail → D1 conversation (reuse `contacts`/`conversations`/`messages` with `platform='email'`) + broadcast; `forward_to` on mailbox honored (opt-in per mailbox).

## Implementation tasks (ordered)

### 1. Prerequisites (manual, one-time)
- KV: `CLOUDFLARE_API_TOKEN` (perms: Zone:Edit, DNS:Edit, Email Routing Addresses/Rules/Settings:Edit, Zone:Read), `CLOUDFLARE_ACCOUNT_ID`.
- Confirm account: Workers Paid, CNAME-zone availability (Business+), Email Routing + Email Sending available, existing zone `navasanganakah.com` (OTP sender) onboarded for sending.

### 2. D1 migration `db_migrations/0006_email_service.sql`
- `ALTER TABLE domains ADD COLUMN zone_id TEXT;`
- `ALTER TABLE domains ADD COLUMN setup_mode TEXT DEFAULT 'full';` (`'full' | 'cname'`)
- `ALTER TABLE domains ADD COLUMN nameservers TEXT;` (JSON array, full mode)
- `ALTER TABLE domains ADD COLUMN verification_records TEXT;` (JSON, cname mode: CNAME/TXT to add)
- `ALTER TABLE domains ADD COLUMN mx_records TEXT;` `spf_record TEXT;` `dkim_records TEXT;` (JSON array) `dmarc_record TEXT;`
- `ALTER TABLE domains ADD COLUMN routing_rule_id TEXT;`
- `ALTER TABLE domains ADD COLUMN sending_onboarded INTEGER DEFAULT 0;`
- `ALTER TABLE domains ADD COLUMN error_message TEXT;` `ALTER TABLE domains ADD COLUMN last_checked_at DATETIME;`
- `ALTER TABLE domain_emails ADD COLUMN local_part TEXT;` `ADD COLUMN is_default INTEGER DEFAULT 0;` `ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP;`
- New table `email_send_logs (id TEXT PK, workspace_id TEXT NOT NULL, domain_id TEXT, from_email TEXT, to_email TEXT, subject TEXT, status TEXT DEFAULT 'sent', error_code TEXT, error_message TEXT, message_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FK workspace_id → workspaces ON DELETE CASCADE)`.
- Index: `idx_email_send_logs_workspace (workspace_id, created_at)`.

### 3. `src/services/cloudflareApi.ts` (new)
- `cfFetch(env, path, options)` → wraps `https://api.cloudflare.com/client/v4` with token from KV; throws typed errors with CF `errors[]`.
- `createZone(domain, mode)` → `POST /zones` `{name, account:{id}, type:'full'|'cname'}` → returns `{zoneId, status, nameServers[], verificationInfo}`.
- `getZone(zoneId)` → `GET /zones/{id}` (status: pending/active).
- `enableEmailRouting(zoneId)` → `POST /zones/{id}/email/routing/enable`.
- `getRouting(zoneId)` → `GET /zones/{id}/email/routing` (enabled + DNS record status).
- `addRoutingDnsRecords(zoneId)` → `POST /zones/{id}/email/routing/dns` → returns MX/SPF/DKIM records created (store in DB for UI).
- `createCatchAllRule(zoneId, workerName)` → `POST /zones/{id}/email/routing/rules` `{matchers:[{type:'all'}], actions:[{type:'worker', value:[workerName]}]}`; `deleteRoutingRule(zoneId, ruleId)`.
- `deleteZone(zoneId)` → `DELETE /zones/{id}`.
- Optional (check availability): `onboardEmailSending(accountId, zoneId)` via Email Service REST endpoint; else manual.

### 4. `src/services/emailService.ts` (new)
- `sendEmail(env, {to, from, subject, html?, text?, replyTo?, cc?, bcc?})` → `env.EMAIL_SENDER.send({...})` structured API; returns `{messageId}`; maps error codes: `E_SENDER_NOT_VERIFIED`/`E_SENDER_DOMAIN_NOT_AVAILABLE` → 400 "domain sending not onboarded", `E_RATE_LIMIT_EXCEEDED` → 429, `E_RECIPIENT_SUPPRESSED` → 400, else 500. Keep legacy `EmailMessage` fallback if structured API unavailable at runtime.
- `validateFromAddress(env, workspaceId, fromEmail)` → from-domain must be a `domains` row with `status='active'` (and ideally `sending_onboarded=1`).
- `onboardDomain(env, domainRow)` → orchestration: create zone (if no zone_id) → if zone active: enable routing → add DNS records → create catch-all rule → update row → `status='active'`; if zone pending: `status='pending'`, save nameservers/verification records; wrap errors → `status='failed'` + `error_message`.
- `checkDomain(env, domainRow)` → `getZone` + `getRouting`; returns current DNS instructions; updates `last_checked_at`.
- `removeDomain(env, domainRow)` → delete catch-all rule → disable/leave routing → delete zone → delete DB row (cascade domain_emails).
- `templateRender(html, vars)` — replace `{{var}}` placeholders (name, otp, link, ...).
- `handleIncomingEmail(message, env, ctx)` — see task 6.

### 5. Routes in `src/index.ts` (replace/augment existing block at 1451-1521)
- `POST /api/domains` — validate domain (lowercase, strip protocol, no subdomain? allow `mail.example.com` only for full mode — enforce root domain for routing), check uniqueness, insert row `status='pending'`, call `onboardDomain` async (`waitUntil`), return row + DNS instructions.
- `GET /api/domains` — list workspace domains w/ DNS instructions JSON-parsed.
- `POST /api/domains/:id/verify` — re-check CF status, onboard if now active, return updated row.
- `DELETE /api/domains/:id` — remove zone + row.
- `POST /api/domain-emails` (mailbox create: domainId, localPart, forwardTo?) + `DELETE /api/domain-emails/:id` — keep existing `GET /api/domain-emails/:domainId`.
- `POST /api/email/send` — `{to, subject, html?, text?, fromAddress?, templateType?, variables?}` → validate → render template if given → send → insert log → return `{messageId}`. Add per-workspace KV rate limit (reuse `RATE:` pattern, e.g. 60/min).
- `GET /api/email/send-logs?limit=` — recent logs for workspace.
- `POST /api/email/test` — sends `{from, to}` test mail using `sending_onboarded` check; surfaces CF error codes for domain readiness (used by UI "verify sending" flow).
- Update `src/types.ts`: add `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` accessors via KV (no new binding needed; or add `getCloudflareToken(env)` helper).

### 6. Incoming email — implement `email()` handler (src/index.ts:3548)
- Parse `message.to` (first address) → domain part → `SELECT d.* FROM domains d WHERE d.domain_name = ? AND d.status='active'`.
- Resolve mailbox: exact `domain_emails.email_address` match; else default mailbox (`is_default=1`); else domain-level catch-all handling (create conversation under workspace).
- Sender: find/create `contacts` row (`platform='email'`, `platform_contact_id = message.from` lowercased, name from From header if parseable).
- Conversation: reuse open conversation for (workspace, contact, platform='email') or create `conversations` row `platform='email'`, `status='open'`.
- Parse raw MIME (simple headers + text/plain or text/html extraction; store both; attachments optional — store to R2 keyed `email/<uuid>/<name>`; if no simple parser feasible, add `mailparser` dep with `nodejs_compat`).
- Insert `messages` row (`sender_type='contact'`, `content` = text body, `media_url` = html/json, `message_type='email'`).
- Broadcast via `CHAT_DO.idFromName(conversationId)` POST /broadcast `{type:'email_incoming', conversationId, from, subject}` (+ workspace-global DO for inbox badge if inbox listens there).
- If mailbox `forward_to` set: forward via `EMAIL_SENDER.send` with a new `EmailMessage` (guard against loops: skip forwarding if forward target domain is also onboarded).
- Wrap in try/catch; log failures (never crash handler).

### 7. `wrangler.toml`
- Keep `[[send_email]] name="EMAIL_SENDER"`. Add `[[email]]`? Not needed — email trigger is defined by routing rules referencing worker name `dheetantra-social-crm`. Verify `email()` handler + `[assets]` deploy works; if not, create `wrangler.email.toml` (same D1/KV/R2 bindings, no assets) and deploy as separate worker; routing rule then references that worker name.

### 8. Frontend — `components/EmailServiceView.tsx` (new) + dashboard wiring
- Add `'email'` to `activeTab` union (line 14), NavItem "ईमेल सेवा" (Mail icon) near Broadcast (line ~442), header title mapping (line 476), render `{activeTab === 'email' && <EmailServiceView />}` (line ~530), import the component.
- View sections (client component, same Tailwind conventions as `WhatsAppManagerView`, `useToast`):
  1. **Domains list**: status badge (pending/active/failed), mode chip, nameservers (full) or verification CNAME/TXT (cname) with copy buttons, DNS table (MX/SPF/DKIM/DMARC) after onboarding, actions: "फिर से जांचें" (verify), "हटाएं" (delete with confirm).
  2. **Add domain modal**: domain input, setup-mode select (Full recommended / CNAME if available), default mailbox local-part + forward_to.
  3. **Mailboxes per domain**: table (address, forward_to, status), add/delete.
  4. **Compose modal**: From select (mailboxes of active domains), To, Subject, body (HTML textarea + optional template picker + variable hints `{{name}} {{otp}} {{link}}`), Send.
  5. **Test send** button per domain (surfaces readiness errors).
  6. **Templates**: list + edit via existing `POST/GET /api/email-templates` (subject, bodyHtml).
  7. **Send logs**: table (time, from, to, subject, status, error) via `GET /api/email/send-logs`.
- Loading/empty states, Hindi labels consistent with existing dashboard.

### 9. Admin (optional, low priority)
- Add domains list + onboarded status to `app/admin/page.tsx` (reuse `GET /api/admin/domains`-style endpoint or workspace list). Skip if time-boxed.

## Validation plan

1. `npx wrangler d1 migrations apply dhitantra_db_prod --local` (and `--remote` for prod) — schema applies cleanly.
2. `npm run lint` and `npm run build` (Next build typechecks TS incl. dashboard edits).
3. Local: `wrangler dev`; with KV token set, `POST /api/domains` for a throwaway test domain → expect zone created (`GET /zones/{id}` shows pending), nameservers returned.
4. After nameserver change (or cname records) → `POST /api/domains/:id/verify` → status active, MX/SPF/DKIM present (check `dig MX <domain>`, `dig TXT cf2024-1._domainkey.<domain>`), catch-all rule exists.
5. `POST /api/email/test` → structured send succeeds; error mapping works when sending not onboarded (`E_SENDER_*`).
6. Send email to `anything@<testdomain>` → `email()` handler inserts conversation + message; verify in D1 and broadcast via DO.
7. UI: add domain, copy records, verify, compose+send, logs, template edit — end to end on preview deploy.

## Risks / notes

- Email Sending onboarding API may not exist publicly → manual dashboard onboarding documented in UI as "step 2" (flag in code via `sending_onboarded` check). Detection: send test → `E_SENDER_NOT_VERIFIED`.
- CNAME zones may be unavailable on DheeTantra's plan → hide option; full setup remains default.
- Zone limit (100 zones on free plan) — monitor; consider account-level plan.
- Free-plan Workers cannot send to external recipients (paid required) — OTP sending already works, but confirm.
- `email()` handler + `[assets]` coexistence — verify early (checkpoint before UI work); fallback separate email worker config.
- Inbox UI is WhatsApp-centric; email conversations appear in lists but reply via Meta API paths must be guarded (`platform === 'email'` → reply through email send instead, or disable reply button until phase 2).
- 5 MiB / 50 recipients / 32 attachments per send; daily + rate limits surfaced via error codes.

## Out of scope (phase 2 candidates)

- Email reply UI inside inbox (sending replies from conversation thread), attachments in inbound pipeline beyond R2 storage, email open/click analytics, SMTP/REST API endpoints for customers, per-mailbox DKIM customization.
