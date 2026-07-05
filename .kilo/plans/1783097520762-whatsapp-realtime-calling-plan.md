# WhatsApp Cloud API Realtime Calling — पूर्ण सुधार योजना

## मौजूदा आर्किटेक्चर (Working)

```
WhatsApp User → Meta Graph API → Webhook POST /api/whatsapp/webhook
                                    │
                          change.field === 'calls' ?
                                    │
                         ┌──────────┴──────────┐
                         │    event: offer      │
                         │    (SDP, callId,     │
                         │     phoneNumberId)   │
                         └──────────┬──────────┘
                                    │
                    ┌───────────────┴────────────────┐
                    │ Durable Object Broadcast        │
                    │ (global-{workspaceId})           │
                    │ type: whatsapp_incoming_call     │
                    └───────────────┬────────────────┘
                                    │
                    ┌───────────────┴────────────────┐
                    │ Frontend WebSocket              │
                    │ → setIncomingCall()              │
                    │ → Show Incoming Call UI          │
                    └───────────────┬────────────────┘
                                    │
                          User clicks "उठाएं"
                                    │
                    ┌───────────────┴────────────────┐
                    │ useWhatsAppWebRTC.answer()      │
                    │ 1. Fetch TURN/ICE credentials   │
                    │ 2. getUserMedia (mic)           │
                    │ 3. RTCPeerConnection            │
                    │ 4. setRemoteDescription(SDP)    │
                    │ 5. createAnswer → setLocalDesc  │
                    │ 6. Wait for ICE gathering       │
                    │ 7. POST /calls/{id}/answer      │
                    │    → Meta: pre_accept + accept  │
                    └───────────────┬────────────────┘
                                    │
                        Call Connected! Audio flowing
```

## पहचाने गए अंतर (Gaps)

| # | समस्या | File(s) | असर |
|---|--------|---------|------|
| 1 | **Decline Meta API से reject नहीं करता** | `app/dashboard/page.tsx` (line 443) | WhatsApp user को ringing जारी |
| 2 | **Call timeout/auto-dismiss नहीं** | `app/dashboard/page.tsx` (line 120-200) | 30s बाद UI stuck |
| 3 | **Dual recording (hook + ActiveCallManager)** | `lib/hooks/useWhatsAppWebRTC.ts` + `app/dashboard/page.tsx` (ActiveCallManager) | Recording conflict |
| 4 | **No outbound call support** | `src/index.ts` | Business call नहीं कर सकता |
| 5 | **No ICE restart on failure** | `lib/hooks/useWhatsAppWebRTC.ts` | Network change → call drop |
| 6 | **No device selection** | `lib/hooks/useWhatsAppWebRTC.ts` | Default mic/speaker only |
| 7 | **No recording playback** | `app/dashboard/page.tsx` (CallsView) | Recording देख/सुन नहीं सकते |
| 8 | **Multiple agents conflict** | `app/dashboard/page.tsx` + `src/index.ts` | सबको call दिखता है, कोई answer करे तो? |
| 9 | **Same caller rapid calls** | `src/index.ts` (webhook handler) | Busy signal नहीं भेज सकते |
| 10 | **No WebRTC quality stats** | `lib/hooks/useWhatsAppWebRTC.ts` | Call quality monitor नहीं |

## Implementation Steps

### Step 1: Decline → Meta API Reject

**Files:** `app/dashboard/page.tsx`

Decline button handler में Meta API reject call जोड़ें:

```
onClick:
  POST /api/whatsapp/calls/:id/reject { phoneNumberId }
  POST /api/whatsapp/calls/:id/status { status: 'declined' }
  setIncomingCall(null)
```

### Step 2: Call Timeout Auto-Dismiss

**File:** `app/dashboard/page.tsx`

- `useRef` में 30 सेकंड का `setTimeout` store करें
- Incoming call set करते ही timer start
- `whatsapp_call_terminated` event पर timer cancel
- Timeout expire → auto-reject via Meta API + dismiss UI

### Step 3: Remove Dual Recording

**File:** `app/dashboard/page.tsx` (ActiveCallManager)

- ActiveCallManager से `isRecording`, `mediaRecorderRef`, `toggleRecording`, `chunksRef` हटाएँ
- WebRTC hook में recording upload को `cleanup` में करें (हर स्थिति में upload)
- ActiveCallManager में recording button optional करें (या hook से state लें)

### Step 4: Outbound Call Endpoint

**File:** `src/index.ts` — नया `POST /api/whatsapp/calls/start`

```
Payload: { phoneNumberId, to, sdp }
→ Meta Graph API POST /{phoneNumberId}/calls
  { messaging_product: 'whatsapp', to, action: 'offer', session: { sdp, sdp_type: 'offer' } }
→ Save call record (direction='outgoing', status='ringing')
→ Broadcast to global DO
```

**Note:** WhatsApp Cloud API outbound calling is limited. Meta must enable it.

### Step 5: ICE Restart

**File:** `lib/hooks/useWhatsAppWebRTC.ts`

```
pc.oniceconnectionstatechange:
  if 'failed' → pc.restartIce()
  if still 'failed' after 5s → cleanup with error message
```

### Step 6: Media Devices

**File:** `lib/hooks/useWhatsAppWebRTC.ts`

- नया `getAudioDevices()` → `navigator.mediaDevices.enumerateDevices()`
- `answer()` में `deviceId: selectedMic` pass करें
- Speaker output: `audio.setSinkId(selectedSpeaker)` (if supported)

### Step 7: Recording Playback

**File:** `app/dashboard/page.tsx` (CallsView)

जहाँ call list render होती है, वहाँ `recording_url` हो तो `<audio>` tag दिखाएँ:

```
{c.recording_url && (
  <audio controls src={recordingUrl} className="w-32 h-8" />
)}
```

### Step 8: Multi-Agent Call Routing

**File:** `src/index.ts` + `app/dashboard/page.tsx`

- जब कोई agent answer करे, तो `global-{workspaceId}` DO पर `call_answered_by_another` broadcast
- Frontend: इस event को receive करके `setIncomingCall(null)` करें
- Backend: answer endpoint में broadcast add करें

### Step 9: Incoming Call Cooldown

**File:** `src/index.ts` (webhook handler)

`calls` field handler में `connect`/`offer` event पर:

```
Check DB for same caller_number with status='ringing' in last 60s
  → If found, skip creating duplicate call (dedup already done in chatbot.ts)
```

### Step 10: WebRTC Stats

**File:** `lib/hooks/useWhatsAppWebRTC.ts`

- `setInterval` every 5s → `pc.getStats()`
- Log `packetsLost`, `roundTripTime`, `jitter`
- Store best stats in state for display

## Calling Health Dashboard (API)

```
GET /api/whatsapp/calls/status
→ phone_numbers: [{ phoneNumberId, db_calling_enabled, meta_settings: {...} }]
→ webhook_subscribed: boolean (hint)
→ turn_configured: boolean
→ all_ready: boolean
```

CallsView में "Calling Health" card जोड़ें:

| Check | Status |
|-------|--------|
| Meta Calling | ✅ / ❌ |
| Webhook calls field | 🔍 (manual) |
| TURN Configured | ✅ / ❌ |
| All Ready | ✅ / ❌ |

## Deployment Checklist

1. Meta Business Suite → WhatsApp → Webhook → `calls` field subscribed ✅
2. Phone Number Settings → Calling → ENABLED ✅
3. `callback_permission_status: 'ENABLED'` ✅
4. TURN credentials in KV: `CLOUDFLARE_CALLS_APP_ID`, `CLOUDFLARE_API_TOKEN` ✅
5. `wrangler.toml` → Durable Object `ChatDurableObject` configured ✅
6. WebSocket route `/api/chat/connect/:roomId` working ✅
