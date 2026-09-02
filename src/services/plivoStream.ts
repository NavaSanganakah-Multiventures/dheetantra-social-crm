// ---------------------------------------------------------------------------
// Plivo <Stream> <-> Gemini Live voice bot bridge.
//
// When a workspace enables the Voice Bot on a Plivo account, the inbound
// webhook (/api/plivo/webhook/voice) returns a <Stream> element pointing at
// /plivo-stream/:callId. Plivo opens a bidirectional WebSocket here and streams
// caller audio (audio/x-mulaw;rate=8000). We convert it to 16kHz PCM, send it
// to the Gemini Live API, and pipe Gemini's 24kHz PCM response back to Plivo
// (re-encoded to 8kHz mu-law) so the caller hears the AI assistant ("Arya").
//
// No agent PSTN leg is ever dialed for a voice-bot call, so there is no
// per-minute agent/forwarding charge: only the single inbound caller leg is
// billed by Plivo. Media flows caller <-> Plivo edge <-> this Worker <-> Gemini,
// which keeps end-to-end latency low.
//
// This route lives outside /api/* on purpose so it is NOT subject to the
// workspace auth/session middleware (Plivo connects server-to-server with no
// cookies). Security is enforced by matching the Plivo "start" event's
// accountId against the call's plivo_configs.auth_id.
// ---------------------------------------------------------------------------

import { Context } from 'hono';
import { Env } from '../types';
import { sqliteNow } from '../shared';
import {
  base64ToBytes,
  bytesToBase64,
  mulaw8kToPcm16kBytes,
  pcm24kBytesToMulaw8k,
} from './audioCodec';

const GEMINI_LIVE_WS =
  'wss://generativelanguage.googleapis.com/ws/' +
  'google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=';

const DEFAULT_INSTRUCTIONS =
  'You are "Arya", a friendly and concise voice receptionist for a business CRM. ' +
  'Speak in the same language the caller uses (default Hindi/Hinglish). Keep answers short and conversational. ' +
  'Greet warmly, understand why the caller is calling, answer their questions, and note their name and purpose. ' +
  'If they need a human agent or you cannot help, tell them you will arrange a callback. Never invent facts; if unsure, say so.';

function safeSend(ws: WebSocket | null, msg: string): void {
  if (ws && ws.readyState === 1) {
    try { ws.send(msg); } catch (e) { /* ignore transient send errors */ }
  }
}

// Main bridge coroutine: runs after the Plivo WebSocket server side is accepted.
async function bridgePlivoStream(env: Env, callId: string, plivoWs: WebSocket): Promise<void> {
  const call = await env.DB.prepare(
    'SELECT id, workspace_id, plivo_config_id FROM calls WHERE id = ?'
  ).bind(callId).first<{ id: string; workspace_id: string; plivo_config_id: string }>();
  if (!call || !call.plivo_config_id) {
    try { plivoWs.close(4000, 'unknown call'); } catch {}
    return;
  }

  const config = await env.DB.prepare(
    'SELECT auth_id, voice_bot_instructions, voice_bot_greeting FROM plivo_configs WHERE id = ?'
  ).bind(call.plivo_config_id).first<{ auth_id: string; voice_bot_instructions: string | null; voice_bot_greeting: string | null }>();
  if (!config) {
    try { plivoWs.close(4000, 'no plivo config'); } catch {}
    return;
  }

  const geminiKey = await env.SECRETS_KV.get('GEMINI_API_KEY');
  if (!geminiKey) {
    console.error('[PlivoStream] GEMINI_API_KEY missing in SECRETS_KV');
    try { plivoWs.close(4001, 'gemini key missing'); } catch {}
    return;
  }

  const model = (await env.SECRETS_KV.get('GEMINI_LIVE_MODEL')) || 'gemini-2.0-flash-exp';
  const instructions = (config.voice_bot_instructions && config.voice_bot_instructions.trim())
    || DEFAULT_INSTRUCTIONS;

  let streamId: string | null = null;
  let geminiReady = false;
  let geminiWs: WebSocket | null = null;
  let transcript = '';
  let closed = false;

  const persistTranscript = (): void => {
    if (!transcript) return;
    env.DB.prepare(
      "UPDATE calls SET transcript = COALESCE(?, transcript) WHERE id = ?"
    ).bind(transcript, callId).run().catch(() => {});
  };

  // ---- Connect to Gemini Live (outbound WebSocket client) ----
  const geminiUrl = GEMINI_LIVE_WS + encodeURIComponent(geminiKey);
  let gResp: Response;
  try {
    gResp = await fetch(geminiUrl, { headers: { Upgrade: 'websocket' } });
  } catch (e) {
    console.error('[PlivoStream] gemini fetch failed', e);
    try { plivoWs.close(4002, 'gemini connect failed'); } catch {}
    return;
  }
  if (gResp.status !== 101 || !(gResp as any).webSocket) {
    try { plivoWs.close(4002, 'gemini upgrade failed'); } catch {}
    return;
  }
  geminiWs = (gResp as any).webSocket as WebSocket;
  (geminiWs as any).accept();

  const sendSetup = (): void => {
    const setupMsg = JSON.stringify({
      setup: {
        model: 'models/' + model,
        responseModalities: ['AUDIO'],
        systemInstruction: { parts: [{ text: instructions }] },
      },
    });
    safeSend(geminiWs, setupMsg);
  };

  if (geminiWs.readyState === 1) {
    sendSetup();
  } else {
    geminiWs.addEventListener('open', sendSetup);
  }

  geminiWs.addEventListener('message', (event: MessageEvent) => {
    let data: any;
    try {
      data = JSON.parse(typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data as ArrayBuffer));
    } catch {
      return;
    }

    if (data.setupComplete) {
      geminiReady = true;
      return;
    }

    const sc = data.serverContent;
    if (!sc) return;

    // Barge-in: stop any audio currently being played to the caller.
    if (sc.interrupted && streamId) {
      safeSend(plivoWs, JSON.stringify({ event: 'clearAudio', streamId }));
    }

    if (sc.modelTurn && Array.isArray(sc.modelTurn.parts)) {
      for (const part of sc.modelTurn.parts) {
        const inline = part && part.inlineData;
        if (inline && inline.data) {
          const pcmBytes = base64ToBytes(inline.data);
          const mulaw = pcm24kBytesToMulaw8k(pcmBytes);
          safeSend(plivoWs, JSON.stringify({
            event: 'playAudio',
            media: { contentType: 'audio/x-mulaw', sampleRate: 8000, payload: bytesToBase64(mulaw) },
          }));
        }
      }
    }

    if (sc.inputTranscription && sc.inputTranscription.text) {
      transcript += 'Caller: ' + sc.inputTranscription.text + '\n';
    }
    if (sc.outputTranscription && sc.outputTranscription.text) {
      transcript += 'Arya: ' + sc.outputTranscription.text + '\n';
      persistTranscript();
    }
  });

  // ---- Plivo -> Gemini: caller audio ----
  plivoWs.addEventListener('message', (event: MessageEvent) => {
    let data: any;
    try {
      data = JSON.parse(typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data as ArrayBuffer));
    } catch {
      return;
    }

    if (data.event === 'start') {
      streamId = (data.start && data.start.streamId) || null;
      const accountId = data.start && data.start.accountId;
      if (accountId && config.auth_id && accountId !== config.auth_id) {
        console.warn('[PlivoStream] accountId mismatch', accountId, config.auth_id);
        try { plivoWs.close(4003, 'accountId mismatch'); } catch {}
        return;
      }
    } else if (data.event === 'media') {
      if (!geminiReady) return;
      const payload = data.media && data.media.payload;
      if (!payload) return;
      const mulaw = base64ToBytes(payload);
      const pcm = mulaw8kToPcm16kBytes(mulaw);
      safeSend(geminiWs, JSON.stringify({
        realtimeInput: { audio: { data: bytesToBase64(pcm), mimeType: 'audio/pcm;rate=16000' } },
      }));
    } else if (data.event === 'dtmf') {
      // '*' = interrupt the bot's current response.
      if (data.dtmf && data.dtmf.digit === '*' && streamId) {
        safeSend(plivoWs, JSON.stringify({ event: 'clearAudio', streamId }));
      }
    }
  });

  // ---- Cleanup ----
  const teardown = (): void => {
    if (closed) return;
    closed = true;
    try { persistTranscript(); } catch {}
    env.DB.prepare(
      "UPDATE calls SET status = CASE WHEN status IN ('in_progress','ringing') THEN 'ended' ELSE status END, " +
      "ended_at = COALESCE(ended_at, ?) WHERE id = ?"
    ).bind(sqliteNow(), callId).run().catch(() => {});
    try { broadcastCallEnded(env, call.workspace_id, callId); } catch {}
    try { if (geminiWs) geminiWs.close(); } catch {}
  };

  plivoWs.addEventListener('close', teardown);
  plivoWs.addEventListener('error', teardown);
  geminiWs.addEventListener('close', () => { try { plivoWs.close(); } catch {} });
  geminiWs.addEventListener('error', () => { try { plivoWs.close(); } catch {} });
}

async function broadcastCallEnded(env: Env, workspaceId: string, callId: string): Promise<void> {
  try {
    const doId = env.CHAT_DO.idFromName('global-' + workspaceId);
    const stub = env.CHAT_DO.get(doId);
    await stub.fetch(new Request('http://internal/broadcast', {
      method: 'POST',
      body: JSON.stringify({
        type: 'call_status_updated',
        call_id: callId,
        status: 'ended',
        source: 'plivo',
        voiceBot: true,
      }),
    }));
  } catch (e) {
    console.error('[PlivoStream] broadcast error', e);
  }
}

// Hono handler for the Plivo Stream WebSocket upgrade.
export async function plivoStreamHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const callId = c.req.param('callId');
  if (!/^[0-9a-fA-F-]{36}$/.test(callId || '')) {
    return c.text('Bad call id', 400);
  }
  const upgrade = (c.req.header('upgrade') || '').toLowerCase();
  if (upgrade !== 'websocket') {
    return c.text('Expected WebSocket', 426);
  }

  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
  (server as any).accept();

  bridgePlivoStream(c.env as Env, callId as string, server).catch((e) => {
    console.error('[PlivoStream] bridge error', e);
    try { server.close(1011, 'bridge error'); } catch {}
  });

  return new Response(null, { status: 101, webSocket: client });
}
