# Broadcast System Rebuild Plan

## Goal
Rebuild WhatsApp broadcast system with: contact selection from contacts list (checkboxes), template-based broadcasting only, inline template picker in inbox when window expires, full backend implementation with Cloudflare Queues, and live progress tracking.

---

## 1. Frontend: BroadcastView Rebuild (`app/dashboard/page.tsx`)

**Current:** Simple form with campaign name + text body + queue button. No contact selection, no template selection, sends `contactIds: []`.

**New BroadcastView flow:**

### Step 1: Load contacts + templates on mount
- Fetch contacts from `GET /api/crm/contacts` (already exists)
- Fetch templates from `GET /api/whatsapp/templates` (already exists)
- Fetch WABA configs from `GET /api/whatsapp/config` (already exists)

### Step 2: UI Layout (replace lines 2106-2165)
```
┌─────────────────────────────────────────┐
│ WhatsApp Broadcast                       │
├─────────────────────────────────────────┤
│ Campaign Name: [input]                   │
│                                         │
│ Select Template: [dropdown]             │
│ Template Preview: "Hi {{1}}, ..."       │
│ Parameter {{1}}: [input]                │
│                                         │
│ Sender WABA: [dropdown] (if >1 config) │
│                                         │
│ Recipients (X selected):               │
│ ┌─ Search contacts... ─────────────┐   │
│ │ ☑ Rahul      +919876543210      │   │
│ │ ☑ Priya      +919123456789      │   │
│ │ ☐ Amit       +918765432109      │   │
│ │ ☑ Neha       +917654321098      │   │
│ └──────────────────────────────────┘   │
│ [Select All] [Clear All]                │
│                                         │
│ [Send Broadcast to 3 Contacts]          │
│                                         │
│ Progress: ████████░░ 67% (2/3 sent)    │
│ Sent: 2  Failed: 0  Pending: 1         │
└─────────────────────────────────────────┘
```

### Step 3: State variables
- `broadcastContacts: any[]` - all contacts loaded
- `selectedContactIds: Set<string>` - checkbox selections
- `selectedTemplate: any` - chosen template
- `templateParams: string[]` - dynamic parameter values
- `broadcastCampaignName: string`
- `sending: boolean` - broadcast in progress
- `broadcastProgress: { total, sent, failed, pending } | null`

### Step 4: Contact selection
- Scrollable list with search filter
- Checkboxes on each contact
- "Select All" / "Clear All" buttons
- Show count: "X contacts selected"

### Step 5: Send broadcast handler
```
POST /api/broadcast
Body: {
  workspaceId,
  campaignName,
  templateName,
  languageCode,
  parameters: [...],
  contactIds: ["id1", "id2", ...],
  phoneNumberId
}
```

### Step 6: Progress tracking
- After broadcast submit, start polling `GET /api/broadcast/:campaignId/progress`
- Poll every 2 seconds
- Show progress bar: `sent / total`
- Stop polling when `sent + failed >= total`

---

## 2. Frontend: Inline Template Picker in InboxView (`app/dashboard/page.tsx`)

**Current:** When `isTemplateRequired` is true, message input is disabled with a banner saying "Send Template Message" but NO way to actually send a template from the inbox.

**New: Inline template picker (lines ~1843-1847)**

### When `isTemplateRequired` is true:
- Show a template selector row ABOVE the message input
- Dropdown of approved templates (from Meta)
- If template has parameters, show dynamic input fields
- "Send Template" button

```
┌──────────────────────────────────────┐
│ ⚠️ 24hr window expired. Send a       │
│    template to re-engage.            │
│                                      │
│ Template: [select dropdown ▼]        │
│ {{1}}: [input]  {{2}}: [input]       │
│ [Send Template Message]              │
├──────────────────────────────────────┤
│ [📎] [Type a message...]    [>]  │
└──────────────────────────────────────┘
```

### State additions to InboxView:
- `inboxTemplates: any[]` - loaded on mount
- `selectedInboxTemplate: any`
- `inboxTemplateParams: string[]`

### Handler:
- `handleSendInboxTemplate()` - calls `POST /api/whatsapp/templates/send` (already exists)
- After send, fetch conversations to refresh window status

---

## 3. Backend: POST `/api/broadcast` (Full Implementation)

**Current:** `src/index.ts:2649` - returns `{ success: true }` without doing anything.

**New implementation:**

### Step 1: Validate inputs
- `workspaceId`, `campaignName`, `templateName`, `contactIds[]` required
- Fetch WABA config for `phoneNumberId`

### Step 2: Create campaign record
```sql
INSERT INTO broadcast_campaigns (id, workspace_id, name, status, total_recipients)
VALUES (?, ?, ?, 'processing', ?)
```

### Step 3: Queue messages via Cloudflare Queue
- For each contactId in contactIds:
  - Look up contact's `platform_contact_id` (phone number)
  - Send message to queue: `{ campaignId, workspaceId, contactId, phoneId, templateName, languageCode, parameters }`
  - Use `env.BROADCAST_QUEUE.send()` (Cloudflare Queue binding)

### Step 4: Return campaign ID
```json
{ "success": true, "campaignId": "...", "total": contactIds.length }
```

### Note: Queue binding
- `wrangler.toml` must have `[[queues.producers]]` with binding `BROADCAST_QUEUE`
- `wrangler.toml` must have `[[queues.consumers]]` pointing to `workers/broadcast-queue.ts`

---

## 4. Backend: GET `/api/broadcast/:campaignId/progress`

**New endpoint in `src/index.ts`:**

```ts
app.get('/api/broadcast/:campaignId/progress', authMiddleware, async (c) => {
  const campaign = await env.DB.prepare(
    'SELECT total_recipients, successful_sends, failed_sends, status FROM broadcast_campaigns WHERE id = ? AND workspace_id = ?'
  ).bind(campaignId, workspaceId).first();
  
  return c.json({
    total: campaign.total_recipients,
    sent: campaign.successful_sends,
    failed: campaign.failed_sends,
    pending: campaign.total_recipients - campaign.successful_sends - campaign.failed_sends,
    status: campaign.status
  });
});
```

---

## 5. Worker: `workers/broadcast-queue.ts` Update

**Current:** Handles raw text broadcast via WhatsApp API.

**New:** Handle template-based broadcast.
- Receive `{ campaignId, workspaceId, contactId, phoneId, templateName, languageCode, parameters }`
- Fetch contact phone from D1
- Fetch WABA access token from SECRETS_KV
- Send template message via Meta API: `POST /v19.0/{phoneId}/messages` with template payload
- Update `broadcast_campaigns` success/fail count
- On all messages processed, update campaign status to `completed`

---

## 6. Files to Modify

| File | Changes |
|------|---------|
| `app/dashboard/page.tsx` | Rewrite `BroadcastView` (lines 2106-2165), add inline template picker to `InboxView` (lines 1843-1847) |
| `src/index.ts` | Rewrite `POST /api/broadcast` (line 2649), add `GET /api/broadcast/:id/progress` |
| `workers/broadcast-queue.ts` | Update to handle template-based broadcast messages |
| `wrangler.toml` | Add `[[queues.producers]]` binding if not present |

---

## 7. Validation Steps

1. `npx tsc --noEmit` - 0 errors
2. `npm run build` - successful
3. Manual test: Create broadcast with 2-3 contacts, verify campaign created in D1
4. Verify queue worker processes messages
5. Verify progress polling works end-to-end
6. Verify inbox template picker appears when window is expired
7. Verify template sends from inbox successfully

---

## 8. Risks

- **Cloudflare Queue binding** - must be configured in `wrangler.toml` or broadcast won't work
- **Meta API rate limits** - queue worker processes sequentially, may need batching for large lists
- **Template parameters** - all contacts get the same parameter values (no per-contact personalization in this version)
