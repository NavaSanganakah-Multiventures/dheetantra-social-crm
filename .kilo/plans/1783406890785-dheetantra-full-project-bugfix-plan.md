# DheeTantra - पूरे Project का Bug Audit & Refactor Plan

## 📌 Context

**Tech Stack:**
- Frontend: Next.js 16 + React 19 + TypeScript + Tailwind v4 + `motion` (Framer Motion v12 style)
- Backend: Cloudflare Worker (`src/index.ts`) + Hono router
- Database: Cloudflare D1
- Storage: Cloudflare R2 (`MEDIA_BUCKET`)
- Real-time: Cloudflare Durable Object `ChatDurableObject`
- Auth: OTP via email + session cookie in KV
- Integrations: Meta WhatsApp Cloud API, Firebase FCM, Cloudflare TURN, Google GenAI (Gemini)

**Main Source Files Reviewed:**
- `app/dashboard/page.tsx` (5632 lines — ginormous client component)
- `src/index.ts` (2889 lines — main worker)
- `src/services/chatbot.ts`
- `src/routes/meta-oauth.ts`
- `src/routes/admin.ts`
- `src/schema.ts`
- `schema.sql`, `db_migrations/*.sql`
- `lib/hooks/useWhatsAppWebRTC.ts`
- `lib/fcm.ts`, `lib/firebase-client.ts`
- `workers/*.ts`
- `wrangler.toml`, `next.config.ts`, `tsconfig.json`

---

## 🔴 Critical Bugs (Pahle Yeh Fix Karo)

### 1. AI Chatbot — Wrong Gemini Model Name
**File:** `src/services/chatbot.ts:206`
```ts
model: 'gemini-3.5-flash'
```
**Bug:** Ye model exist nahi karta. Correct names: `gemini-1.5-flash` ya `gemini-2.0-flash`.
**Impact:** AI reply mode completely fail hoga.

### 2. Broadcast API Call Missing `Content-Type`
**File:** `app/dashboard/page.tsx:2129`
```ts
await fetch('/api/broadcast', { method: 'POST', body: JSON.stringify({...}) });
```
**Bug:** Header missing. Hono backend me `await c.req.json()` fail ho sakta hai.
**Same bug in:** `app/login/page.tsx` (line 22, 42) — send-otp & verify-otp.

### 3. WhatsApp WebRTC Call Recording Upload Field Mismatch
**File:** `lib/hooks/useWhatsAppWebRTC.ts:236`
```ts
formData.append('recording', blob, `call-${call.id}.webm`);
```
**Bug:** Backend `POST /api/whatsapp/calls/recordings` expects field name `file` (`src/index.ts:2352`).
**Impact:** Recordings upload hamesha fail hoga.

### 4. Audio Double-Playback / Echo
**Files:**
- `app/dashboard/page.tsx:139-149` — creates a separate `new Audio()` and plays `rtcRemoteStream`.
- `app/dashboard/page.tsx:4507` — `<audio ref={audioRef} autoPlay />` bhi same stream play karti hai.
**Bug:** Do audio elements ek saath chalengi → echo.
**Fix:** Dashboard wala effect hatao, sirf `ActiveCallManager` me audio rakho.

### 5. WebRTC Recording Only Records Local Side
**File:** `lib/hooks/useWhatsAppWebRTC.ts:196-214`
**Bug:** `combinedStream` me sirf local audio tracks add hain. Remote stream (`remoteStream`) add nahi kiya gaya.
**Fix:** Dono tracks add karo (privacy/legal check is scope me rakhna).

### 6. Outgoing Call UX is Misleading
**File:** `app/dashboard/page.tsx:4059-4085`
**Bug:** `startOutgoingCall` DB record create karta hai, phir alert dikhata hai *“Outbound calls are currently not supported…”*.
**Impact:** User confused. Call ka UI indefinite `ringing` me reh sakta hai.
**Fix:** Outgoing calls ko disabled mark karo aur DB record mat banao.

### 7. `ScheduleView` is Non-Functional Placeholder
**File:** `app/dashboard/page.tsx:2182-2225`
**Bug:** Inputs uncontrolled hain, state nahi, API call nahi.
**Impact:** Schedule Workflow button kuch nahi karta.

### 8. `attachmentType === 'text'` Not Handled
**File:** `app/dashboard/page.tsx:885, 970-1057`
**Bug:** Type union me `'text'` allowed hai, lekin `sendRichMessage` switch me nahi hai. Empty payload jayega.

### 9. Location Message Sends NaN if Invalid
**File:** `app/dashboard/page.tsx:1030-1035`
**Bug:** Lat/Lng parseFloat se hote hain without validation. NaN backend reject karega.

### 10. Global WebSocket Dependencies Incomplete
**File:** `app/dashboard/page.tsx:234-342`
**Bug:** Effect uses `user?.workspace_id` (line 269) but dependency array sirf `[callingEnabled]`.
**Impact:** `user` change par `workspace_id` stale ho sakti hai.

### 11. `health` State Dead Code in CallsView
**File:** `app/dashboard/page.tsx:3983`
**Bug:** State declare hai par kabhi `setHealth` nahi. UI me readiness indicators dikhane ke liye backend `/api/whatsapp/calls/status` ka use karna chahiye.

### 12. CORS `credentials: true` + `origin: '*'` Risk
**File:** `src/index.ts:163-170`
**Bug:** `Access-Control-Allow-Credentials: true` ke saath `origin: '*'` allowed nahi hota browsers me. Ek specific origin allow karo ya dynamic origin check use karo.

### 13. Preview & Production Share Same D1 + KV
**File:** `wrangler.toml:19-31, 69-79`
**Bug:** `preview_id` aur `id` same values use kar rahe hain; `preview.database_id` bhi prod se same hai.
**Impact:** Preview environment me testing prod data ko corrupt kar sakta hai.

### 14. `npm run dev` Command Does Production Build
**File:** `package.json:6`
```json
"dev": "NODE_ENV=production next build && wrangler dev --port 3000"
```
**Bug:** Dev mode me `NODE_ENV=production` set hai. Is se development DX poor hota hai aur warnings/errors hide hote hain.

### 15. `compatibility_date` Too Old
**File:** `wrangler.toml:3`
```toml
compatibility_date = "2024-03-20"
```
**Bug:** Workers with Assets aur newer features ke liye newer date chahiye. `nodeJs_compat` issues ho sakte hain.

### 16. WhatsApp Config Save Ignores SIP Fields Sent by Frontend
**File:** `src/index.ts:1354-1448`
**Bug:** Dashboard `WhatsAppManagerView` (`app/dashboard/page.tsx:4704-4743`) `sip_uri`, `sip_ws_server`, etc. backend ko bhejta hai, lekin backend sirf `phone_number_id, waba_id, access_token, verify_token, reply_mode` DB me save karta hai. SIP data silently drop ho jata hai.
**Note:** Backend comment kehta hai "SIP columns removed". Frontend aur backend sync me nahi hain.

### 17. `src/schema.ts` Migration Logic Fragile
**File:** `src/schema.ts:83-152`
**Bug:** `ALTER TABLE ... ADD COLUMN` without `DEFAULT` ya careful ordering for D1/SQLite. Existing rows ke liye column add karte waqt data loss ya constraint failure ho sakta hai.

### 18. Dashboard File is 5632 Lines
**File:** `app/dashboard/page.tsx`
**Impact:** Maintenance, bundle size, re-render performance, code review sab affected.
**Fix:** Components alag files me split karo.

---

## 🟠 Medium Priority Issues

### 19. Mock Admin/Backend Response
**File:** `src/index.ts:964-968`
```ts
app.post('/api/auth/login', async (c) => c.json({ token: 'jwt_or_api_key', workspace_id: 'tenant_123' }));
```
**Bug:** Yeh endpoint use nahi ho raha (OTP flow hai) lekin agar koi client bhejega toh fake response milega.

### 20. Email Worker Not Bound in `wrangler.toml`
**Files:** `workers/inbox-services.ts`, `wrangler.toml`
**Bug:** `InboxRealtime` class aur `inboxEmailWorker` alag worker files me hain lekin `wrangler.toml` me register nahi. Dead code / future deployment.

### 21. Broadcast Queue Worker Not Bound
**File:** `workers/broadcast-queue.ts`
**Bug:** NOTIFICATION_QUEUE toh bound hai, lekin broadcast worker alag file me hai aur uska production routing unclear hai.

### 22. `DB異なる schema versions between migration files and schema.sql`
**Files:** `db_migrations/0001_initial.sql` vs `schema.sql`
**Differences:**
- `whatsapp_configs.workspace_id` — migration has `UNIQUE`, schema.sql does not (multi-config support mismatch).
- `contacts` table — schema.sql has `phone`, `additional_phone`, `email`, `gender`, `is_lead`, etc.; migration me nahi.
- `conversations` — schema.sql has `phone_number_id`, `customer_last_message_at`; migration partial.
- `messages` — schema.sql has `message_type`; migration me nahi.
**Impact:** Fresh migration vs admin manual migrate se schema alag alag banega.

### 23. `cors()` Middleware Runs After Domain Check But Domain Check Skips Localhost
**File:** `src/index.ts:117-160`
**Bug:** `isBaseDomain` check ke baad bhi `cors({ origin: '*' })` lagta hai. Credentials true ke saath issue.

### 24. Call Terminate/Reject Backend Doesn't Validate Workspace on Config Lookup
**File:** `src/index.ts:2218-2341`
**Bug:** Backend `phoneNumberId` se config fetch karta hai without verifying `workspace_id`. Lekin call record itself workspace scoped hai, toh potential mis-routing.

### 25. `settings` route updates KV session but not DB `users.timezone` robustly
**File:** `src/index.ts:342-369`
**Bug:** DB update fail ho sakti hai silently (`try/catch` console error only). KV update successful dikhaye.

### 26. FCM Token Lookup Uses Raw SQL placeholders without Limit
**File:** `src/index.ts:636-647`
**Bug:** `IN (...)` placeholders safe hain lekin agar users bahut zyada ho toh query badi ho sakti hai.

### 27. `DashboardWrapper` Doesn't Set Loading False Before Router Push
**File:** `app/dashboard/page.tsx:41-57`
**Bug:** `setLoading(false)` `router.push('/login')` ke baad hai. Strictly wrong nahi lekin race condition UX me flash ho sakta hai.

### 28. `crypto.randomUUID()` Usage in Browser May Fail on HTTP
**File:** `app/dashboard/page.tsx:4890`
**Bug:** `crypto.randomUUID()` secure context chahta hai. Local dev me theek, lekin kuch edge cases me fail.

### 29. `formatUserDateTime`/`formatUserTimeOnly` Exported Even Though Internal Use
**File:** `app/dashboard/page.tsx:15-34`
**Note:** Not bug, but architecture smell. Util functions alag file me hone chahiye.

### 30. `CallsView` Stats Count Logic Off
**File:** `app/dashboard/page.tsx:4101-4105`
**Bug:** `completedCalls` includes `answered` but dashboard treats `answered` as incoming accepted call status. Backend uses `in_progress` after answer. Inconsistent status values across frontend/backend.

---

## 🟡 Architectural / Performance Issues

### 31. Entire Client App in One File
**File:** `app/dashboard/page.tsx` (5632 lines)
**Fix Required:**
- `app/dashboard/components/*` banao
- Har view (`InboxView`, `CallsView`, `ContactsView`, etc.) apni file me
- Common UI (`NavItem`, `StatCard`, `ActiveCallManager`) extract karo
- Custom hooks (`useWorkspaceId`, `useAuth`, `useGlobalWebSocket`) alag file me

### 32. `localStorage.getItem('workspaceId')` Repeated Everywhere
**Fix:** Auth/Workspace Context banao jo single source of truth ho.

### 33. `any` Types Everywhere
**Impact:** Type safety nahi, refactoring me regression ka khatra.
**Fix:** Shared types banao for User, Contact, Conversation, Message, Call, Config, etc.

### 34. `tsconfig.json` Excludes `src`, `workers`, `db_migrations`
**File:** `tsconfig.json:39-44`
**Bug:** `next build` worker code ko type-check nahi karta. Runtime errors escape karenge.
**Fix:** Alag worker tsconfig ya root config include karo.

### 35. `lib/cloudflare.ts` Imports `NextRequest`
**File:** `lib/cloudflare.ts:2`
**Bug:** Worker code me `NextRequest` available nahi hota. Yeh web standard `Request` hona chahiye.

### 36. `next.config.ts` HMR Disabled Comment But HMR Still Possible
**File:** `next.config.ts:26-34`
**Note:** `DISABLE_HMR=true` environment variable se HMR disabled. This is unconventional dev config.

### 37. `public/` Empty — No `firebase-messaging-sw.js`
**File:** `public/*`
**Bug:** FCM foreground listener hai lekin service worker nahi hai. Background push notifications kaam nahi karenge.

### 38. `useWhatsAppWebRTC` Hook Doesn't Export Useful State
**Bug:** `isMuted`, `callDuration`, `error` return karta hai, lekin `ActiveCallManager` apna `seconds` state maintain karta hai. Duplicate.

### 39. `ChatDurableObject` Broadcast To All Sockets Regardless of Room
**File:** `src/index.ts:63-87`
**Bug:** DO per-room basis hota hai (`/api/chat/connect/:roomId`), lekin `webSocketMessage` me `socket !== ws` se saare sockets ko bhejta hai. Same DO me multiple rooms nahi hain, but global DO use case me careful rehna hai.

### 40. `webSocketClose` Calls `ws.close()` Inside Close Handler
**File:** `src/index.ts:89-96`
**Bug:** Already closing socket ko dobara close kar raha hai. Unnecessary error potential.

---

## 🟢 Recommended Implementation Phases

### Phase 1 — Critical Runtime Fixes (Sabse Pehle)
1. `chatbot.ts` Gemini model name fix → `gemini-1.5-flash` / `gemini-2.0-flash`.
2. Add `Content-Type: application/json` to all POST `fetch` calls in client pages.
3. Fix WebRTC recording upload field name (`recording` → `file`) ya backend field name update.
4. Remove duplicate remote audio playback in Dashboard.
5. Outgoing Call button disable/remove until real outbound flow implemented.
6. Disable or implement `ScheduleView` placeholder.
7. Validate lat/lng before sending location messages.
8. Fix global WebSocket dependencies (`callingEnabled`, `user?.workspace_id`).
9. Use backend `/api/whatsapp/calls/status` in `CallsView` health indicator.

### Phase 2 — Schema & Wrangler Stability
1. Align `schema.sql` and `db_migrations/*.sql`.
2. Remove `UNIQUE(workspace_id)` from migration if multi-WABA is intended.
3. Generate a fresh migration file for missing columns.
4. `wrangler.toml` me preview IDs separate karo (new D1 preview DB, new KV preview namespace).
5. Update `compatibility_date` to a recent date.
6. Fix `package.json` dev script: remove `NODE_ENV=production`.

### Phase 3 — Frontend Architecture Refactor
1. Split `app/dashboard/page.tsx` into components:
   - `app/dashboard/components/Sidebar.tsx`
   - `app/dashboard/components/TopHeader.tsx`
   - `app/dashboard/views/DashboardOverview.tsx`
   - `app/dashboard/views/InboxView.tsx`
   - `app/dashboard/views/BroadcastView.tsx`
   - `app/dashboard/views/ScheduleView.tsx`
   - `app/dashboard/views/ContactsView.tsx`
   - `app/dashboard/views/CallsView.tsx`
   - `app/dashboard/views/TemplatesView.tsx`
   - `app/dashboard/views/WhatsAppManagerView.tsx`
   - `app/dashboard/views/SettingsView.tsx`
   - `app/dashboard/views/IntegrationsView.tsx`
   - `app/dashboard/components/ActiveCallManager.tsx`
2. Create contexts:
   - `AuthContext` (user, login, logout)
   - `WorkspaceContext` (workspaceId, configs, refresh)
3. Create API helper: `lib/api.ts` with common headers and error handling.

### Phase 4 — Type Safety & Backend Cleanup
1. Replace `any` with shared types.
2. Make `src/index.ts` type-safe via the separate worker tsconfig.
3. Move route handlers into per-feature files (`src/routes/whatsapp.ts`, `src/routes/inbox.ts`, `src/routes/calls.ts`, etc.).
4. Add consistent error logging & metrics.

### Phase 5 — Calling Feature Hardening
1. Reconcile WebRTC status state across client/backend.
2. Add call timeout if no connection.
3. Properly record both local + remote audio if legally allowed; else disable recording.
4. Fix hangup/terminate race conditions.
5. Add Cloudflare TURN credentials caching.

### Phase 6 — Notifications & Integrations
1. Add `public/firebase-messaging-sw.js` for background FCM.
2. Bind/Register broadcast worker properly or remove unused code.
3. Implement scheduled posts with workflows or remove placeholder.

---

## ✅ Validation Plan

1. `npm run lint` clean.
2. `npx tsc --noEmit` for client code.
3. Worker code type-check via separate config: `npx tsc --project tsconfig.worker.json`.
4. Local dev: `npm run dev` works and dashboard loads.
5. OTP login end-to-end.
6. WhatsApp webhook receive + message save + real-time inbox update.
7. AI auto-reply in AI mode.
8. Incoming call overlay + answer + hangup (with actual Meta calls field).
9. Media send/receive.
10. Dashboard split into components without functional regression.

---

## ⚠️ Risks & Open Questions

1. **WhatsApp Outbound Calls:** Meta Cloud API abhi sirf incoming calls widely support karta hai. Outbound call UI disable karna chahiye ya alag SIP provider integrate karna hai?
2. **Recording Consent:** Call recording ke liye legal consent UI/notification required. Is feature ko abhi enable karna hai ya Phase 5 me?
3. **Multi-WABA:** Kya ek workspace me multiple WhatsApp numbers officially support karna hai? Agar haan, toh migration `UNIQUE(workspace_id)` constraint hataana padega.
4. **Workers Architecture:** Kya `workers/inbox-services.ts` aur `workers/broadcast-queue.ts` ko alag deploy karna hai ya `src/index.ts` me merge karna hai?
5. **FCM Service Worker:** Background push notifications priority hai ya sirf foreground console log enough hai?

---

## 🎯 Recommended First Action

Critical bugs ko ek PR me fix karo:
- Gemini model name
- Missing `Content-Type` headers
- WebRTC recording upload field
- Double audio playback
- Outgoing call misleading flow
- Location validation
- Global WS dependencies

Phir Phase 2 (schema/wrangler stability) karo, uske baad Phase 3 (dashboard split) shuru karo.
