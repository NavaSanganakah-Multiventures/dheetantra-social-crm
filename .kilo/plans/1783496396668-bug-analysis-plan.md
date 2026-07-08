# बग सुधार + Secrets KV Migration योजना

> **प्रोजेक्ट:** Dheetantra Social CRM  
> **तारीख:** 08 जुलाई 2026

---

## सारांश

मुख्य दो काम:
1. **12 bugs** ठीक करना — बिल्ड तोड़ने वाले, type safety, सुरक्षा, लॉजिक
2. **Secrets को env से KV में migrate** करना — `GEMINI_API_KEY`, `TURN_KEY_*`, `FCM_SERVICE_ACCOUNT_JSON`, `WHATSAPP_*`

`ENVIRONMENT` flag env में ही रहेगा (secret नहीं है)।

---

## भाग A: Secrets KV Migration

### A1. `src/types.ts` — Env interface से secrets हटाएँ

**वर्तमान:**
```typescript
export interface Env {
  DB: D1Database;
  SECRETS_KV: KVNamespace;
  MEDIA_BUCKET: R2Bucket;
  CHAT_DO: DurableObjectNamespace;
  AUTOMATION_WORKFLOW: any;
  NOTIFICATION_QUEUE: Queue<any>;
  ENVIRONMENT: string;
  WHATSAPP_VERIFY_TOKEN: string;    // ← हटाना है (KV se padh raha hai)
  WHATSAPP_API_TOKEN: string;       // ← हटाना है (KV se padh raha hai)
  EMAIL_SENDER: any;
  TURN_KEY_ID: string;              // ← हटाना है (KV fallback hai)
  TURN_KEY_API_TOKEN: string;       // ← हटाना है (KV fallback hai)
  GEMINI_API_KEY: string;           // ← हटाना है (KV se padhega)
}
```

**नया:**
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

### A2. `src/services/chatbot.ts:204` — GEMINI_API_KEY KV से पढ़ें

**वर्तमान:**
```typescript
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
```

**नया:**
```typescript
const geminiKey = await env.SECRETS_KV.get('GEMINI_API_KEY');
if (!geminiKey) {
  replyText = "AI service not configured.";
  // return or throw
}
const ai = new GoogleGenAI({ apiKey: geminiKey });
```

### A3. `src/index.ts:2416-2417` — TURN keys से env fallback हटाएँ

**वर्तमान:**
```typescript
const turnKeyId = (c.env.SECRETS_KV ? (await c.env.SECRETS_KV.get('CLOUDFLARE_CALLS_APP_ID') || await c.env.SECRETS_KV.get('TURN_KEY_ID')) : null) || c.env.TURN_KEY_ID;
const turnToken = (c.env.SECRETS_KV ? (await c.env.SECRETS_KV.get('CLOUDFLARE_API_TOKEN') || await c.env.SECRETS_KV.get('TURN_KEY_API_TOKEN')) : null) || c.env.TURN_KEY_API_TOKEN;
```

**नया:**
```typescript
const turnKeyId = await c.env.SECRETS_KV.get('CLOUDFLARE_CALLS_APP_ID') || await c.env.SECRETS_KV.get('TURN_KEY_ID');
const turnToken = await c.env.SECRETS_KV.get('CLOUDFLARE_API_TOKEN') || await c.env.SECRETS_KV.get('TURN_KEY_API_TOKEN');
```

### A4. `lib/fcm.ts` — FCM_SERVICE_ACCOUNT_JSON KV से पढ़ें

**वर्तमान:** `fcm.ts` `CloudflareEnv` type import करता है और `env.FCM_SERVICE_ACCOUNT_JSON` direct access करता है।

**नया:** `fcm.ts` में `sendPushNotification` का first parameter `Env` (from `../src/types`) होगा। अंदर KV से पढ़ेगा:

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

### A5. `lib/cloudflare.ts` — CloudflareEnv से FCM हटाएँ

`FCM_SERVICE_ACCOUNT_JSON` property हटाएँ — ab ye KV se aata hai, env binding se nahi।

```typescript
export interface CloudflareEnv {
  DB: D1Database;
  SECRETS_KV: KVNamespace;
  EMAIL_SENDER: any;
  INBOX_DO: any;
  BROADCAST_QUEUE: any;
  POST_PUBLISHER_WORKFLOW: any;
  MEDIA_BUCKET: any;
  // FCM_SERVICE_ACCOUNT_JSON हटाया — ab KV se padhega
}
```

### A6. `.env.example` अपडेट करें

`GEMINI_API_KEY` को env example से हटाएँ और KV instructions में add करें:

```
# KV SECRETS में set करें (wrangler kv key put):
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

## भाग B: Build-Breaking Bugs

### B1. `src/index.ts:10` — `schemaSql`, `dropSql` import हटाएँ

```typescript
// DELETE this line:
import { schemaSql, dropSql } from './schema';
```

ये exports `schema.ts` में मौजूद नहीं हैं। अगर ज़रूरत है तो `schema.sql` फ़ाइल को TypeScript constant में convert करें।

### B2. `src/routes/admin.ts:47` — `schema.sql` import ठीक करें

**वर्तमान:**
```typescript
import schemaSqlContent from '../../schema.sql';
```

**नया — Option A (recommended):** एक `src/schema-content.ts` फ़ाइल बनाएँ:
```typescript
// src/schema-content.ts
// This will be replaced at build time or read at runtime
export const SCHEMA_SQL = `
-- Paste schema.sql contents here or read dynamically
`;
```

**Option B:** `.d.ts` declaration file बनाएँ:
```typescript
// schema.sql.d.ts
declare module '*.sql' {
  const content: string;
  export default content;
}
```

### B3. `src/index.ts:25` — `data.type` unknown access

```typescript
// वर्तमान:
const data = await request.json();
console.log(`[DO Broadcast] Sending type=${data.type}...`);

// नया:
const data = await request.json() as { type?: string; [key: string]: any };
console.log(`[DO Broadcast] Sending type=${data.type}...`);
```

### B4. `src/index.ts:753-754, 2779, 2784` — `data.url` unknown access (3 जगह)

```typescript
// वर्तमान:
const data = await res.json();
if (data.url) { ... }

// नया:
const data = await res.json() as { url?: string };
if (data.url) { ... }
```

### B5. `src/services/chatbot.ts:92` — calling_enabled type

```typescript
// वर्तमान:
const cfg = await env.DB.prepare("SELECT calling_enabled FROM whatsapp_configs WHERE phone_number_id = ?")
  .bind(phoneNumberId).first();
callingEnabled = cfg.calling_enabled; // unknown → number

// नया:
const cfg = await env.DB.prepare("SELECT calling_enabled FROM whatsapp_configs WHERE phone_number_id = ?")
  .bind(phoneNumberId).first<{ calling_enabled: number }>();
callingEnabled = cfg.calling_enabled;
```

### B6. `src/services/chatbot.ts:190` — reply_mode type

```typescript
// वर्तमान:
const config = await env.DB.prepare('SELECT reply_mode FROM whatsapp_configs WHERE phone_number_id = ?')
  .bind(phoneNumberId).first();
replyMode = config.reply_mode; // unknown → string

// नया:
const config = await env.DB.prepare('SELECT reply_mode FROM whatsapp_configs WHERE phone_number_id = ?')
  .bind(phoneNumberId).first<{ reply_mode: string }>();
replyMode = config.reply_mode;
```

---

## भाग C: सुरक्षा Bugs

### C1. `src/routes/admin.ts:21` — हार्डकोडेड admin email हटाएँ

```typescript
// वर्तमान:
let isAdmin = email === 'navasanganakah@gmail.com';

// नया — हटाएँ, केवल KV-based admin list use करें:
let isAdmin = false;
const adminEmailsConfig = await c.env.SECRETS_KV.get('ADMIN_EMAILS');
```

### C2. `src/routes/admin.ts:383-417` — KV secrets values mask करें

```typescript
// वर्तमान:
val = await c.env.SECRETS_KV.get(keyName) || '';

// नया — सभी secret values mask करें:
val = '••••••••';
```

### C3. `src/index.ts:963-968` — Dummy login endpoint

```typescript
// वर्तमान:
app.post('/api/auth/login', async (c) => {
  return c.json({ token: 'jwt_or_api_key', workspace_id: 'tenant_123' });
});

// नया — हटाएँ या proper auth लगाएँ:
// DELETE this endpoint entirely (OTP-based login already exists)
```

### C4. `src/index.ts` — Protected routes पर auth middleware

न्यूनतम इन routes पर auth check add करें:
- `/api/crm/contacts` (line 971)
- `/api/crm/contacts/import` (line 985)
- `/api/broadcast` (line 2649)
- `/api/workspace` (line 2720)

```typescript
// Helper function (index.ts के ऊपर add करें):
async function requireSession(c: any): Promise<{ id: string } | null> {
  const sessionId = getCookie(c, 'auth_session');
  if (!sessionId || !c.env.SECRETS_KV) return null;
  const userDataStr = await c.env.SECRETS_KV.get(`SESSION:${sessionId}`);
  if (!userDataStr) return null;
  try { return JSON.parse(userDataStr); } catch { return null; }
}

// Protected routes में:
app.get('/api/crm/contacts', async (c) => {
  const user = await requireSession(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  // ... rest
});
```

---

## भाग D: सफ़ाई

### D1. `fix_syntax.js` — delete करें

Root directory में मौजूद अस्थायी fix script है। `.gitignore` में `fix_*.js` pattern भी add करें।

---

## भाग E: Env Type Sync (架构)

### E1. `lib/cloudflare.ts` — CloudflareEnv और `src/types.ts` — Env को sync करें

दोनों interfaces में अब sync हो जाएगा:
- `src/types.ts` Env: केवल Worker bindings (DB, KV, R2, DO, Queue, ENVIRONMENT, EMAIL_SENDER)
- `lib/cloudflare.ts` CloudflareEnv: Next.js frontend bindings (DB, KV, EMAIL_SENDER, INBOX_DO, BROADCAST_QUEUE, POST_PUBLISHER_WORKFLOW, MEDIA_BUCKET)

---

## कार्य क्रम (Execution Order)

1. **A1** — `src/types.ts` Env interface cleanup
2. **A2** — `chatbot.ts` GEMINI_API_KEY → KV
3. **A3** — `index.ts` TURN keys env fallback हटाएँ
4. **A4+A5** — `lib/fcm.ts` + `lib/cloudflare.ts` FCM → KV
5. **A6** — `.env.example` update
6. **B1+B2** — Schema import ठीक करें
7. **B3+B4** — Type assertions add करें (index.ts)
8. **B5+B6** — Generic types add करें (chatbot.ts)
9. **C1** — Hardcoded admin email हटाएँ
10. **C2** — KV secrets masking
11. **C3** — Dummy login endpoint हटाएँ
12. **C4** — Auth middleware add करें
13. **D1** — `fix_syntax.js` delete

---

## सत्यापन

1. `npx tsc --noEmit` — 0 errors
2. `npm run build` — successful build
3. FCM push notification flow verify करें (KV से service account पढ़ रहा है)
4. Gemini AI reply mode test करें (KV से key पढ़ रहा है)
5. TURN/ICE credentials test करें (KV se aa rahe hain)
