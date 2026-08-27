import { Hono } from 'hono';
import { Env } from '../types';
import { sqliteNow } from '../shared';

function normalizeE164(raw: string, defaultCountryCode = '91'): string {
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, '');

  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (!trimmed.startsWith('+') && digits.length === 10) {
    digits = defaultCountryCode + digits;
  }

  return '+' + digits;
}

function maskPhone(p: string): string {
  if (!p || p.length <= 4) return '****';
  return '****' + p.slice(-4);
}

const router = new Hono<{ Bindings: Env }>();

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
  const user = c.get('user');
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
  const user = c.get('user');
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

export default router;
