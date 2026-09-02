import { Hono } from 'hono';
import { Env } from '../types';
import { requireRole, sqliteNow } from '../shared';
import { normalizeE164 } from '../utils/phoneUtils';
import { markAgentDeclined, claimCallAnswer, notifyCallAnswered, checkAllAgentsDeclined, restoreAgentStatus } from '../services/callRouting';

function maskPhone(p: string): string {
  if (!p || p.length <= 4) return '****';
  return '****' + p.slice(-4);
}

const router = new Hono<{ Bindings: Env; Variables: { user: any; workspaceRole?: string } }>();

// List workspace members with their voice availability status.
router.get('/api/voice/agents', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { results } = await c.env.DB.prepare(
    'SELECT wm.user_id, wm.role, wm.voice_status, wm.voice_status_updated_at, u.name, u.email, u.phone FROM workspace_members wm JOIN users u ON u.id = wm.user_id WHERE wm.workspace_id = ? ORDER BY u.name ASC, u.email ASC'
  ).bind(workspaceId).all<{ user_id: string; role: string; voice_status: string; voice_status_updated_at?: string | null; name?: string | null; email?: string | null; phone?: string | null }>();

  const agents = (results || []).map((r) => ({
    userId: r.user_id,
    role: r.role,
    voiceStatus: r.voice_status,
    voiceStatusUpdatedAt: r.voice_status_updated_at || null,
    name: r.name || '',
    email: r.email || '',
    phoneMasked: maskPhone(r.phone || ''),
  }));

  return c.json({ agents });
});

// Set the authenticated user's own voice availability status.
router.post('/api/voice/agent-status', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const user = c.get('user') as any;
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);
  if (!user || !user.id) return c.json({ error: 'Authentication required' }, 401);

  const { status } = await c.req.json() as any;
  if (status !== 'live' && status !== 'not_live' && status !== 'busy') {
    return c.json({ error: 'Status must be live, not_live or busy' }, 400);
  }

  const member = await c.env.DB.prepare('SELECT user_id FROM workspace_members WHERE workspace_id = ? AND user_id = ?').bind(workspaceId, user.id).first();
  if (!member) return c.json({ error: 'You are not a member of this workspace' }, 403);

  await c.env.DB.prepare('UPDATE workspace_members SET voice_status = ?, voice_status_updated_at = ? WHERE workspace_id = ? AND user_id = ?')
    .bind(status, sqliteNow(), workspaceId, user.id).run();

  return c.json({ success: true, voiceStatus: status });
});

// Set the authenticated user's PSTN phone number (used for agent legs and
// outbound fallback bridges).
router.post('/api/voice/agent-phone', async (c) => {
  const user = c.get('user') as any;
  if (!user || !user.id) return c.json({ error: 'Authentication required' }, 401);

  const { phone } = await c.req.json() as any;
  if (!phone || typeof phone !== 'string') return c.json({ error: 'Phone number is required' }, 400);

  const normalized = normalizeE164(phone.trim());
  if (!/^\+\d{7,15}$/.test(normalized)) {
    return c.json({ error: 'Invalid phone number. Use a valid E.164 number like +919669509952' }, 400);
  }

  await c.env.DB.prepare('UPDATE users SET phone = ? WHERE id = ?').bind(normalized, user.id).run();

  return c.json({ success: true, phone: normalized });
});

// ---------------------------------------------------------------------------
// Per-agent call routing endpoints (simultaneous ring + per-agent decline).
//
// These are called by the Flutter app when an agent reacts to an incoming
// call ring (accept or decline). They are provider-agnostic — the same
// endpoint works for WhatsApp, Plivo and Twilio calls because the ringing
// tracking lives in call_ringing_agents keyed by (call_id, user_id).
// ---------------------------------------------------------------------------

/**
 * Agent DECLINES a call — only THEIR ring stops.
 *
 * The call is NOT torn down. Other agents keep ringing. If this was the last
 * ringing agent, the call is marked 'missed' and the caller is released.
 *
 * Body: { source: 'whatsapp' | 'plivo' | 'twilio' }  (optional, for missed-call logic)
 */
router.post('/api/voice/call/:callId/decline', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const callId = c.req.param('callId');
  const user = c.get('user') as any;
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);
  if (!user || !user.id) return c.json({ error: 'Authentication required' }, 401);

  const body = await c.req.json().catch(() => ({})) as any;
  const source = body.source || '';

  // Verify the call exists in this workspace
  const call = await c.env.DB.prepare(
    'SELECT id, status, source, answered_by_user_id FROM calls WHERE id = ? AND workspace_id = ?'
  ).bind(callId, workspaceId).first<{ id: string; status: string; source: string; answered_by_user_id: string | null }>();
  if (!call) return c.json({ error: 'Call not found' }, 404);

  // If the call was already answered, there is nothing to decline — just
  // tell the client it's done so the local ring UI is dismissed.
  if (call.answered_by_user_id) {
    return c.json({ success: true, alreadyAnswered: true });
  }

  await markAgentDeclined(c.env, callId, user.id);

  // Check if everyone declined — if so, end the call.
  const callSource = source || call.source || 'whatsapp';
  const allDeclined = await checkAllAgentsDeclined(c.env, callId, workspaceId, callSource);

  return c.json({ success: true, allDeclined });
});

/**
 * Agent ANSWERS / claims a call — atomically becomes the answering agent.
 *
 * The first agent to call this wins (answered_by_user_id IS NULL guard).
 * Subsequent callers get alreadyAnswered: true and should dismiss their ring.
 * The winner is marked 'busy' and all other agents receive a 'call_answered'
 * broadcast/push so their rings stop.
 *
 * Body: { source: 'whatsapp' | 'plivo' | 'twilio' }  (for routing the broadcast)
 */
router.post('/api/voice/call/:callId/answer', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const callId = c.req.param('callId');
  const user = c.get('user') as any;
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);
  if (!user || !user.id) return c.json({ error: 'Authentication required' }, 401);

  const body = await c.req.json().catch(() => ({})) as any;
  const source = body.source || '';

  const call = await c.env.DB.prepare(
    'SELECT id, status, source, answered_by_user_id FROM calls WHERE id = ? AND workspace_id = ?'
  ).bind(callId, workspaceId).first<{ id: string; status: string; source: string; answered_by_user_id: string | null }>();
  if (!call) return c.json({ error: 'Call not found' }, 404);

  // Already answered by someone else — let the client dismiss its ring.
  if (call.answered_by_user_id && call.answered_by_user_id !== user.id) {
    return c.json({ success: true, alreadyAnswered: true, answeredBy: call.answered_by_user_id });
  }

  // If this agent already claimed it (idempotent retry), return success.
  if (call.answered_by_user_id === user.id) {
    return c.json({ success: true, alreadyAnswered: false, claimed: true });
  }

  const claimed = await claimCallAnswer(c.env, callId, workspaceId, user.id);
  if (!claimed) {
    return c.json({ success: true, alreadyAnswered: true });
  }

  const callSource = source || call.source || 'whatsapp';
  await notifyCallAnswered(c.env, workspaceId, callId, user.id, callSource);

  return c.json({ success: true, claimed: true });
});

export default router;
