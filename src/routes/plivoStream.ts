import { Hono, Context } from 'hono';
import { Env } from '../types';
import { sqliteNow } from '../shared';

// ---------------------------------------------------------------------------
// Plivo Audio Streaming (bidirectional) <-> Gemini Live API bridge.
//
// The Plivo <Stream bidirectional="true" contentType="audio/x-mulaw;rate=8000">
// element streams caller audio over a WebSocket as base64 mu-law/8000. Gemini
// Live expects audio/pcm;rate=16000 (16-bit little-endian PCM). We decode
// mu-law -> 16-bit PCM and upsample 8k -> 16k for the caller's audio, and
// downsample 16k -> 8k + mu-law-encode for the AI's replies.
//
// Flow: inbound PSTN call -> /api/plivo/webhook/voice -> when no live human
// agent is available and ai_fallback_enabled=1, returns a <Stream> pointing
// at /api/plivo/stream/:workspaceId, which is the bridge below.
// ---------------------------------------------------------------------------

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function plivoXmlResponse(xml: string, status = 200): Response {
  return new Response(xml, { status, headers: { 'Content-Type': 'text/xml; charset=utf-8' } });
}

function getBaseUrl(c: Context): string {
  const env = c.env as any;
  return (env.APP_URL as string | undefined) || ('https://' + (c.req.header('host') || 'dheetantra.navasanganakah.com'));
}

async function broadcastToWorkspace(env: Env, workspaceId: string, payload: any) {
  try {
    const globalDoId = env.CHAT_DO.idFromName('global-' + workspaceId);
    const globalDo = env.CHAT_DO.get(globalDoId);
    await globalDo.fetch(new Request('http://internal/broadcast', {
      method: 'POST',
      body: JSON.stringify(payload),
    }));
  } catch (e) {
    console.error('[Plivo Stream] DO broadcast error:', e);
  }
}

// ---- mu-law <-> 16-bit PCM + resampling helpers ---------------------------

const MULAW_DECODE_TABLE = (() => {
  const t = new Int16Array(256);
  for (let i = 0; i < 256; i++) {
    const x = i ^ 0xFF;
    const sign = (x & 0x80) ? -1 : 1;
    const exponent = (x >> 4) & 0x07;
    const mantissa = x & 0x0F;
    t[i] = (((mantissa | 0x10) << (exponent + 3)) - 0x84) * sign;
  }
  return t;
})();

function mulawDecodeBytes(bytes: Uint8Array): Int16Array {
  const out = new Int16Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = MULAW_DECODE_TABLE[bytes[i]];
  return out;
}

function mulawEncodeSample(sample: number): number {
  const BIAS = 0x84;
  const CLIP = 32635;
  let sign = 0;
  let mag = sample;
  if (mag < 0) { sign = 0x80; mag = -mag; }
  if (mag > CLIP) mag = CLIP;
  mag += BIAS;
  let exponent = 7;
  let mask = 0x4000;
  while ((mag & mask) === 0 && exponent > 0) { exponent--; mask >>= 1; }
  const mantissa = (mag >> (exponent + 3)) & 0x0F;
  return (~(sign | (exponent << 4) | mantissa)) & 0xFF;
}

function mulawEncodeBytes(pcm: Int16Array): Uint8Array {
  const out = new Uint8Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = mulawEncodeSample(pcm[i]);
  return out;
}

function upsampleLinear(input: Int16Array, fromRate: number, toRate: number): Int16Array {
  const ratio = toRate / fromRate;
  const outLen = Math.max(1, Math.floor(input.length * ratio));
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i / ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = input[idx] | 0;
    const b = idx + 1 < input.length ? input[idx + 1] | 0 : a;
    out[i] = Math.round(a + (b - a) * frac);
  }
  return out;
}

function downsampleAverage(input: Int16Array, fromRate: number, toRate: number): Int16Array {
  const ratio = Math.round(fromRate / toRate);
  if (ratio <= 1) return input.slice();
  const outLen = Math.floor(input.length / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    let sum = 0;
    for (let j = 0; j < ratio; j++) sum += input[i * ratio + j] | 0;
    out[i] = Math.round(sum / ratio);
  }
  return out;
}

function bytesFromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
function base64FromBytes(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function int16FromBase64(b64: string): Int16Array {
  const bytes = bytesFromBase64(b64);
  const len = bytes.length - (bytes.length % 2);
  return new Int16Array(bytes.buffer.slice(0, len));
}
function base64FromInt16(arr: Int16Array): string {
  return base64FromBytes(new Uint8Array(arr.buffer));
}

const XML_DECL = '<?xml version="1.0" encoding="UTF-8"?>';

// Build the <Stream> TwiML response that points Plivo at our WebSocket bridge.
export async function buildPlivoAiStreamResponse(
  c: Context,
  config: { plivo_config_id: string; workspace_id: string },
  callId: string,
  from: string,
  callerName: string,
): Promise<Response> {
  const baseUrl = getBaseUrl(c);
  const wsHost = baseUrl.replace(/^https?:\/\//, '');
  const streamUrl = 'wss://' + wsHost + '/api/plivo/stream/' + encodeURIComponent(config.workspace_id)
    + '?callId=' + encodeURIComponent(callId)
    + '&plivoConfigId=' + encodeURIComponent(config.plivo_config_id);
  const statusCallbackUrl = baseUrl + '/api/plivo/webhook/status?callId=' + encodeURIComponent(callId) + '&leg=ai';

  c.executionCtx.waitUntil(broadcastToWorkspace(c.env, config.workspace_id, {
    type: 'plivo_incoming_call',
    callId,
    from,
    callerName,
    sipTarget: null,
    workspaceId: config.workspace_id,
    plivoConfigId: config.plivo_config_id,
    direction: 'incoming',
    aiAgent: true,
  }));

  const xml = XML_DECL +
    '<Response>' +
    '<Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-mulaw;rate=8000" ' +
    'statusCallbackUrl="' + escXml(statusCallbackUrl) + '" statusCallbackMethod="POST">' +
    escXml(streamUrl) +
    '</Stream>' +
    '</Response>';
  return plivoXmlResponse(xml, 200);
}

const router = new Hono<{ Bindings: Env }>();

// Plivo <Stream> WebSocket endpoint — bridges bidirectional mu-law/8000 audio
// to the Gemini Live API (PCM16/16000).
router.get('/api/plivo/stream/:workspaceId', async (c) => {
  const upgrade = c.req.header('Upgrade');
  if (upgrade !== 'websocket') return c.text('Expected Upgrade: websocket', 426);

  const workspaceId = c.req.param('workspaceId');
  const callId = c.req.query('callId') || '';
  const plivoConfigId = c.req.query('plivoConfigId') || '';
  if (!plivoConfigId) return c.text('Missing plivoConfigId', 400);

  const cfg = await c.env.DB.prepare(
    'SELECT ai_instructions, ai_voice_model FROM plivo_configs WHERE id = ? AND workspace_id = ? AND is_active = 1'
  ).bind(plivoConfigId, workspaceId).first<{ ai_instructions: string | null; ai_voice_model: string | null }>();
  if (!cfg) return c.text('Plivo config not found', 404);

  const geminiKey = await c.env.SECRETS_KV.get('GEMINI_API_KEY');
  if (!geminiKey) return c.text('Gemini API key not configured', 500);

  if (callId) {
    await c.env.DB.prepare("UPDATE calls SET status = 'in_progress' WHERE id = ? AND workspace_id = ?")
      .bind(callId, workspaceId).run();
  }

  const geminiUrl = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=' + geminiKey;
  let geminiRes: any;
  try {
    geminiRes = await fetch(geminiUrl, { headers: { Upgrade: 'websocket' } });
  } catch (e: any) {
    console.error('[Plivo Stream] Gemini connect error:', e);
    return c.text('Failed to connect to Gemini', 502);
  }
  if (geminiRes.status !== 101 || !geminiRes.webSocket) return c.text('Failed to bridge to Gemini', 502);

  const geminiWs = geminiRes.webSocket;
  geminiWs.accept();

  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();

  const instructions = cfg.ai_instructions || 'You are a helpful AI assistant for an incoming phone call. Greet the caller politely in Hindi and help them. Keep responses short and conversational.';
  const model = cfg.ai_voice_model || 'models/gemini-2.0-flash-exp';

  geminiWs.send(JSON.stringify({
    setup: {
      model,
      systemInstruction: { parts: [{ text: instructions }] },
      generationConfig: { responseModalities: ['AUDIO'] },
    },
  }));

  let plivoStreamId = '';
  let geminiReady = false;
  const pendingMedia: string[] = [];
  let ended = false;

  const endCall = (status: string) => {
    if (ended || !callId) return;
    ended = true;
    c.executionCtx.waitUntil((async () => {
      try {
        await c.env.DB.prepare("UPDATE calls SET status = ?, ended_at = ? WHERE id = ? AND workspace_id = ?")
          .bind(status, sqliteNow(), callId, workspaceId).run();
        await broadcastToWorkspace(c.env, workspaceId, { type: 'call_status_updated', call_id: callId, status, source: 'plivo' });
      } catch { /* ignore */ }
    })());
  };

  // Plivo -> Gemini
  server.addEventListener('message', (event: any) => {
    const raw = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.event === 'start' && msg.start?.streamId) {
      plivoStreamId = msg.start.streamId;
    } else if (msg.event === 'media' && msg.media?.track === 'inbound' && msg.media?.payload) {
      if (geminiWs.readyState !== WebSocket.OPEN) return;
      const pcm8k = mulawDecodeBytes(bytesFromBase64(msg.media.payload));
      const pcm16k = upsampleLinear(pcm8k, 8000, 16000);
      const b64 = base64FromInt16(pcm16k);
      const chunk = JSON.stringify({ realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: b64 }] } });
      if (geminiReady) {
        geminiWs.send(chunk);
      } else {
        pendingMedia.push(chunk);
      }
    } else if (msg.event === 'stop') {
      try { geminiWs.close(); } catch { /* ignore */ }
      endCall('ended');
    }
  });

  // Gemini -> Plivo
  geminiWs.addEventListener('message', (event: any) => {
    const raw = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
    let data: any;
    try { data = JSON.parse(raw); } catch { return; }

    if (data.setupComplete) {
      geminiReady = true;
      if (geminiWs.readyState === WebSocket.OPEN) {
        for (const chunk of pendingMedia) geminiWs.send(chunk);
      }
      pendingMedia.length = 0;
      return;
    }

    const sc = data.serverContent;
    if (sc && sc.interrupted && server.readyState === WebSocket.OPEN && plivoStreamId) {
      // Caller interrupted the AI — clear any queued Plivo playback.
      server.send(JSON.stringify({ event: 'clearAudio', streamId: plivoStreamId }));
    }
    if (sc && sc.modelTurn) {
      const parts = sc.modelTurn.parts || [];
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          const pcm16k = int16FromBase64(part.inlineData.data);
          const pcm8k = downsampleAverage(pcm16k, 16000, 8000);
          const mulaw = mulawEncodeBytes(pcm8k);
          const b64 = base64FromBytes(mulaw);
          if (server.readyState === WebSocket.OPEN) {
            server.send(JSON.stringify({ event: 'playAudio', media: { contentType: 'audio/x-mulaw', sampleRate: 8000, payload: b64 } }));
          }
        }
      }
    }
  });

  server.addEventListener('close', () => { try { geminiWs.close(); } catch { /* ignore */ } endCall('ended'); });
  server.addEventListener('error', () => { try { geminiWs.close(); } catch { /* ignore */ } });
  geminiWs.addEventListener('close', () => { try { server.close(); } catch { /* ignore */ } });
  geminiWs.addEventListener('error', () => { try { server.close(); } catch { /* ignore */ } });

  return new Response(null, { status: 101, webSocket: client });
});

export default router;
