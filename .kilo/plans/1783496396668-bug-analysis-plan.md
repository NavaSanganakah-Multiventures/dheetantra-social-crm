# Bug Fixes + Secrets KV Migration Plan

> **Project:** Dheetantra Social CRM  
> **Date:** 08 July 2026

---

## Summary

Two main tasks:
1. Fix **12 bugs** - build-breaking, type safety, security, logic
2. **Migrate secrets from env to KV** - `GEMINI_API_KEY`, `TURN_KEY_*`, `FCM_SERVICE_ACCOUNT_JSON`, `WHATSAPP_*`

`ENVIRONMENT` flag stays in env (it is not a secret).

---

## Part A: Secrets KV Migration

### A1. `src/types.ts` - remove secrets from the Env interface

**Current:**
```typescript
export interface Env {
  DB: D1Database;
  SECRETS_KV: KVNamespace;
  MEDIA_BUCKET: R2Bucket;
  CHAT_DO: DurableObjectNamespace;
  AUTOMATION_WORKFLOW: any;
  NOTIFICATION_QUEUE: Queue<any>;
  ENVIRONMENT: string;
  WHATSAPP_VERIFY_TOKEN: string;    // <- to remove (already read from KV)
  WHATSAPP_API_TOKEN: string;       // <- to remove (already read from KV)
  EMAIL_SENDER: any;
  TURN_KEY_ID: string;              // <- to remove (KV fallback exists)
  TURN_KEY_API_TOKEN: string;       // <- to remove (KV fallback exists)
  GEMINI_API_KEY: string;           // <- to remove (will read from KV)
}
```

**New:**
```typescript
export interface Env {
  DB: D1Database;
  SECRETS_KV: KVNamespace;
  MEDIA_BUCKET: R2Bucket;
  CHAT_DO: DurableObjectNamespace;
  AUTOMATION_WORKFLOW: any;
  NOTIFICATION_QUEUE: Queue<any>;
  ENVIRONMENT: string;
  EMAIL_SENDER: any;
}
```

### A2. `src/services/chatbot.ts:204` - read GEMINI_API_KEY from KV

**Current:**
```typescript
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
```

**New:**
```typescript
const geminiKey = await env.SECRETS_KV.get('GEMINI_API_KEY');
if (!geminiKey) {
  replyText = "AI service not configured.";
  // return or throw
}
const ai = new GoogleGenAI({ apiKey: geminiKey });
```

### A3. `src/index.ts:2416-2417` - remove env fallback from TURN keys

**Current:**
```typescript
const turnKeyId = (c.env.SECRETS_KV ? (await c.env.SECRETS_KV.get('CLOUDFLARE_CALLS_APP_ID') || await c.env.SECRETS_KV.get('TURN_KEY_ID')) : null) || c.env.TURN_KEY_ID;
const turnToken = (c.env.SECRETS_KV ? (await c.env.SECRETS_KV.get('CLOUDFLARE_API_TOKEN') || await c.env.SECRETS_KV.get('TURN_KEY_API_TOKEN')) : null) || c.env.TURN_KEY_API_TOKEN;
```

**New:**
```typescript
const turnKeyId = await c.env.SECRETS_KV.get('CLOUDFLARE_CALLS_APP_ID') || await c.env.SECRETS_KV.get('TURN_KEY_ID');
const turnToken = await c.env.SECRETS_KV.get('CLOUDFLARE_API_TOKEN') || await c.env.SECRETS_KV.get('TURN_KEY_API_TOKEN');
```

### A4. `lib/fcm.ts` - read FCM_SERVICE_ACCOUNT_JSON from KV

**Current:** `fcm.ts` imports the `CloudflareEnv` type and directly accesses `env.FCM_SERVICE_ACCOUNT_JSON`.

**New:** In `fcm.ts`, the first parameter of `sendPushNotification` will be `Env` (from `../src/types`). It will read from KV inside:

```typescript
import type { Env } from '../src/types';

export async function sendPushNotification(
  env: Env,
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>
) {
  const serviceAccountJson = await env.SECRETS_KV.get('FCM_SERVICE_ACCOUNT_JSON');
  if (!serviceAccountJson) {
    console.warn("FCM_SERVICE_ACCOUNT_JSON missing from KV. Push notification skipped.");
    return;
  }
  // ... rest same, use serviceAccountJson instead of env.FCM_SERVICE_ACCOUNT_JSON
}
```

### A5. `lib/cloudflare.ts` - remove FCM from CloudflareEnv

Remove the `FCM_SERVICE_ACCOUNT_JSON` property - it now comes from KV, not from an env binding.

```typescript
export interface CloudflareEnv {
  DB: D1Database;
  SECRETS_KV: KVNamespace;
  EMAIL_SENDER: any;
  INBOX_DO: any;
  BROADCAST_QUEUE: any;
  POST_PUBLISHER_WORKFLOW: any;
  MEDIA_BUCKET: any;
  // FCM_SERVICE_ACCOUNT_JSON removed - now reads from KV
}
```

### A6. Update `.env.example`

Remove `GEMINI_API_KEY` from the env example and add it to the KV instructions:

```
# Set in KV SECRETS (wrangler kv key put):
# - GEMINI_API_KEY
# - WHATSAPP_API_TOKEN
# - WHATSAPP_VERIFY_TOKEN
# - TURN_KEY_ID / CLOUDFLARE_CALLS_APP_ID
# - TURN_KEY_API_TOKEN / CLOUDFLARE_API_TOKEN
# - FCM_SERVICE_ACCOUNT_JSON
# - META_USER_ACCESS_TOKEN
# - META_SYSTEM_USER_TOKEN
# - FB_APP_ID
# - FB_CONFIG_ID
# - ADMIN_EMAILS
```

---

## Part B: Build-Breaking Bugs

### B1. `src/index.ts:10` - remove `schemaSql`, `dropSql` imports

```typescript
// DELETE this line:
import { schemaSql, dropSql } from './schema';
```

These exports do not exist in `schema.ts`. If needed, convert the `schema.sql` file into a TypeScript constant.

### B2. `src/routes/admin.ts:47` - fix the `schema.sql` import

**Current:**
```typescript
import schemaSqlContent from '../../schema.sql';
```

**New - Option A (recommended):** create a `src/schema-content.ts` file:
```typescript
// src/schema-content.ts
// This will be replaced at build time or read at runtime
export const SCHEMA_SQL = `
-- Paste schema.sql contents here or read dynamically
`;
```

**Option B:** create a `.d.ts` declaration file:
```typescript
// schema.sql.d.ts
declare module '*.sql' {
  const content: string;
  export default content;
}
```

### B3. `src/index.ts:25` - `data.type` unknown access

```typescript
// Current:
const data = await request.json();
console.log(`[DO Broadcast] Sending type=${data.type}...`);

// New:
const data = await request.json() as { type?: string; [key: string]: any };
console.log(`[DO Broadcast] Sending type=${data.type}...`);
```

### B4. `src/index.ts:753-754, 2779, 2784` - `data.url` unknown access (3 places)

```typescript
// Current:
const data = await res.json();
if (data.url) { ... }

// New:
const data = await res.json() as { url?: string };
if (data.url) { ... }
```

### B5. `src/services/chatbot.ts:92` - calling_enabled type

```typescript
// Current:
const cfg = await env.DB.prepare("SELECT calling_enabled FROM whatsapp_configs WHERE phone_number_id = ?")
  .bind(phoneNumberId).first();
callingEnabled = cfg.calling_enabled; // unknown -> number

// New:
const cfg = await env.DB.prepare("SELECT calling_enabled FROM whatsapp_configs WHERE phone_number_id = ?")
  .bind(phoneNumberId).first<{ calling_enabled: number }>();
callingEnabled = cfg.calling_enabled;
```

### B6. `src/services/chatbot.ts:190` - reply_mode type

```typescript
// Current:
const config = await env.DB.prepare('SELECT reply_mode FROM whatsapp_configs WHERE phone_number_id = ?')
  .bind(phoneNumberId).first();
replyMode = config.reply_mode; // unknown -> string

// New:
const config = await env.DB.prepare('SELECT reply_mode FROM whatsapp_configs WHERE phone_number_id = ?')
  .bind(phoneNumberId).first<{ reply_mode: string }>();
replyMode = config.reply_mode;
```

---

## Part C: Security Bugs

### C1. `src/routes/admin.ts:21` - remove the hardcoded admin email

```typescript
// Current:
let isAdmin = email === 'navasanganakah@gmail.com';

// New - remove it, use only the KV-based admin list:
let isAdmin = false;
const adminEmailsConfig = await c.env.SECRETS_KV.get('ADMIN_EMAILS');
```

### C2. `src/routes/admin.ts:383-417` - mask KV secret values

```typescript
// Current:
val = await c.env.SECRETS_KV.get(keyName) || '';

// New - mask all secret values:
val = '••••••••';
```

### C3. `src/index.ts:963-968` - Dummy login endpoint

```typescript
// Current:
app.post('/api/auth/login', async (c) => {
  return c.json({ token: 'jwt_or_api_key', workspace_id: 'tenant_123' });
});

// New - remove it or add proper auth:
// DELETE this endpoint entirely (OTP-based login already exists)
```

### C4. `src/index.ts` - auth middleware on protected routes

At minimum, add auth checks on these routes:
- `/api/crm/contacts` (line 971)
- `/api/crm/contacts/import` (line 985)
- `/api/broadcast` (line 2649)
- `/api/workspace` (line 2720)

```typescript
// Helper function (add at the top of index.ts):
async function requireSession(c: any): Promise<{ id: string } | null> {
  const sessionId = getCookie(c, 'auth_session');
  if (!sessionId || !c.env.SECRETS_KV) return null;
  const userDataStr = await c.env.SECRETS_KV.get(`SESSION:${sessionId}`);
  if (!userDataStr) return null;
  try { return JSON.parse(userDataStr); } catch { return null; }
}

// In protected routes:
app.get('/api/crm/contacts', async (c) => {
  const user = await requireSession(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  // ... rest
});
```

---

## Part D: Cleanup

### D1. `fix_syntax.js` - delete it

A temporary fix script present in the root directory. Also add the `fix_*.js` pattern to `.gitignore`.

---

## Part E: Env Type Sync (architecture)

### E1. `lib/cloudflare.ts` - sync CloudflareEnv and `src/types.ts` - Env

Both interfaces will now be in sync:
- `src/types.ts` Env: only Worker bindings (DB, KV, R2, DO, Queue, ENVIRONMENT, EMAIL_SENDER)
- `lib/cloudflare.ts` CloudflareEnv: Next.js frontend bindings (DB, KV, EMAIL_SENDER, INBOX_DO, BROADCAST_QUEUE, POST_PUBLISHER_WORKFLOW, MEDIA_BUCKET)

---

## Execution Order

1. **A1** - `src/types.ts` Env interface cleanup
2. **A2** - `chatbot.ts` GEMINI_API_KEY -> KV
3. **A3** - remove `index.ts` TURN keys env fallback
4. **A4+A5** - `lib/fcm.ts` + `lib/cloudflare.ts` FCM -> KV
5. **A6** - `.env.example` update
6. **B1+B2** - fix schema imports
7. **B3+B4** - add type assertions (index.ts)
8. **B5+B6** - add generic types (chatbot.ts)
9. **C1** - remove hardcoded admin email
10. **C2** - KV secrets masking
11. **C3** - remove the dummy login endpoint
12. **C4** - add auth middleware
13. **D1** - `fix_syntax.js` delete

---

## Verification

1. `npx tsc --noEmit` - 0 errors
2. `npm run build` - successful build
3. Verify the FCM push notification flow (reading the service account from KV)
4. Test Gemini AI reply mode (reading the key from KV)
5. Test TURN/ICE credentials (they are coming from KV)
