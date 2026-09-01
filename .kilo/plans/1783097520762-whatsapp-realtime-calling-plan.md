# WhatsApp Cloud API Realtime Calling - Complete Fix Plan

## Current Architecture (Working)

```
WhatsApp User -> Meta Graph API -> Webhook POST /api/whatsapp/webhook
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
                    │ -> setIncomingCall()              │
                    │ -> Show Incoming Call UI          │
                    └───────────────┬────────────────┘
                                    │
                          User clicks "Answer"
                                    │
                    ┌───────────────┴────────────────┐
                    │ useWhatsAppWebRTC.answer()      │
                    │ 1. Fetch TURN/ICE credentials   │
                    │ 2. getUserMedia (mic)           │
                    │ 3. RTCPeerConnection            │
                    │ 4. setRemoteDescription(SDP)    │
                    │ 5. createAnswer -> setLocalDesc  │
                    │ 6. Wait for ICE gathering       │
                    │ 7. POST /calls/{id}/answer      │
                    │    -> Meta: pre_accept + accept  │
                    └───────────────┬────────────────┘
                                    │
                        Call Connected! Audio flowing
```

## Identified Gaps

| # | Problem | File(s) | Impact |
|---|--------|---------|------|
| 1 | **Decline does not reject via Meta API** | `app/dashboard/page.tsx` (line 443) | WhatsApp user keeps ringing |
| 2 | **No call timeout/auto-dismiss** | `app/dashboard/page.tsx` (line 120-200) | UI stuck after 30s |
| 3 | **Dual recording (hook + ActiveCallManager)** | `lib/hooks/useWhatsAppWebRTC.ts` + `app/dashboard/page.tsx` (ActiveCallManager) | Recording conflict |
| 4 | **No outbound call support** | `src/index.ts` | Cannot make business calls |
| 5 | **No ICE restart on failure** | `lib/hooks/useWhatsAppWebRTC.ts` | Network change -> call drop |
| 6 | **No device selection** | `lib/hooks/useWhatsAppWebRTC.ts` | Default mic/speaker only |
| 7 | **No recording playback** | `app/dashboard/page.tsx` (CallsView) | Cannot view/listen to recordings |
| 8 | **Multiple agents conflict** | `app/dashboard/page.tsx` + `src/index.ts` | Call shows to everyone; what if someone answers? |
| 9 | **Same caller rapid calls** | `src/index.ts` (webhook handler) | Cannot send a busy signal |
| 10 | **No WebRTC quality stats** | `lib/hooks/useWhatsAppWebRTC.ts` | No call quality monitor |

## Implementation Steps

### Step 1: Decline -> Meta API Reject

**Files:** `app/dashboard/page.tsx`

Add a Meta API reject call in the Decline button handler:

```
onClick:
  POST /api/whatsapp/calls/:id/reject { phoneNumberId }
  POST /api/whatsapp/calls/:id/status { status: 'declined' }
  setIncomingCall(null)
```

### Step 2: Call Timeout Auto-Dismiss

**File:** `app/dashboard/page.tsx`

- Store a 30-second `setTimeout` in `useRef`
- Start the timer as soon as the incoming call is set
- Cancel the timer on the `whatsapp_call_terminated` event
- Timeout expire -> auto-reject via Meta API + dismiss UI

### Step 3: Remove Dual Recording

**File:** `app/dashboard/page.tsx` (ActiveCallManager)

- Remove `isRecording`, `mediaRecorderRef`, `toggleRecording`, `chunksRef` from ActiveCallManager
- Do the recording upload in `cleanup` in the WebRTC hook (upload in every case)
- Make the recording button optional in ActiveCallManager (or take state from the hook)

### Step 4: Outbound Call Endpoint

**File:** `src/index.ts` - new `POST /api/whatsapp/calls/start`

```
Payload: { phoneNumberId, to, sdp }
-> Meta Graph API POST /{phoneNumberId}/calls
  { messaging_product: 'whatsapp', to, action: 'offer', session: { sdp, sdp_type: 'offer' } }
-> Save call record (direction='outgoing', status='ringing')
-> Broadcast to global DO
```

**Note:** WhatsApp Cloud API outbound calling is limited. Meta must enable it.

### Step 5: ICE Restart

**File:** `lib/hooks/useWhatsAppWebRTC.ts`

```
pc.oniceconnectionstatechange:
  if 'failed' -> pc.restartIce()
  if still 'failed' after 5s -> cleanup with error message
```

### Step 6: Media Devices

**File:** `lib/hooks/useWhatsAppWebRTC.ts`

- New `getAudioDevices()` -> `navigator.mediaDevices.enumerateDevices()`
- Pass `deviceId: selectedMic` in `answer()`
- Speaker output: `audio.setSinkId(selectedSpeaker)` (if supported)

### Step 7: Recording Playback

**File:** `app/dashboard/page.tsx` (CallsView)

Where the call list is rendered, if `recording_url` exists, show an `<audio>` tag:

```
{c.recording_url && (
  <audio controls src={recordingUrl} className="w-32 h-8" />
)}
```

### Step 8: Multi-Agent Call Routing

**File:** `src/index.ts` + `app/dashboard/page.tsx`

- When an agent answers, broadcast `call_answered_by_another` on the `global-{workspaceId}` DO
- Frontend: receive this event and call `setIncomingCall(null)`
- Backend: add the broadcast in the answer endpoint

### Step 9: Incoming Call Cooldown

**File:** `src/index.ts` (webhook handler)

In the `calls` field handler on `connect`/`offer` events:

```
Check DB for same caller_number with status='ringing' in last 60s
  -> If found, skip creating duplicate call (dedup already done in chatbot.ts)
```

### Step 10: WebRTC Stats

**File:** `lib/hooks/useWhatsAppWebRTC.ts`

- `setInterval` every 5s -> `pc.getStats()`
- Log `packetsLost`, `roundTripTime`, `jitter`
- Store best stats in state for display

## Calling Health Dashboard (API)

```
GET /api/whatsapp/calls/status
-> phone_numbers: [{ phoneNumberId, db_calling_enabled, meta_settings: {...} }]
-> webhook_subscribed: boolean (hint)
-> turn_configured: boolean
-> all_ready: boolean
```

Add a "Calling Health" card in CallsView:

| Check | Status |
|-------|--------|
| Meta Calling | ✅ / ❌ |
| Webhook calls field | 🔍 (manual) |
| TURN Configured | ✅ / ❌ |
| All Ready | ✅ / ❌ |

## Deployment Checklist

1. Meta Business Suite -> WhatsApp -> Webhook -> `calls` field subscribed ✅
2. Phone Number Settings -> Calling -> ENABLED ✅
3. `callback_permission_status: 'ENABLED'` ✅
4. TURN credentials in KV: `CLOUDFLARE_CALLS_APP_ID`, `CLOUDFLARE_API_TOKEN` ✅
5. `wrangler.toml` -> Durable Object `ChatDurableObject` configured ✅
6. WebSocket route `/api/chat/connect/:roomId` working ✅
