import { Hono } from 'hono';
import { Env } from '../types';
import { requireRole, pagination, DOMAIN_REGEX } from '../shared';
import {
  createCustomHostname,
  getCustomHostname,
  deleteCustomHostname,
  getHostnameValidationRecord,
  getCloudflareCredentials,
} from '../services/cloudflareApi';

const router = new Hono<{ Bindings: Env }>();

function normalizeDomain(input: string): string {
  let d = String(input || '').toLowerCase().trim();
  try {
    if (d.startsWith('http')) d = new URL(d).hostname;
  } catch { /* keep raw */ }
  d = d.replace(/^www\./, '').replace(/\/+$/, '');
  return d;
}

function getFallbackOrigin(env: any): string {
  return env.SAAS_FALLBACK_ORIGIN || 'app.navasanganakah.com';
}

function mapCfStatus(status?: string): 'pending' | 'pending_validation' | 'active' | 'failed' {
  if (!status) return 'pending';
  const s = status.toLowerCase();
  if (s === 'active') return 'active';
  if (s === 'pending_validation') return 'pending_validation';
  if (s === 'failed') return 'failed';
  return 'pending';
}

// ------------------------------------------
// Add a dashboard custom domain (Cloudflare for SaaS)
// ------------------------------------------
router.post('/api/saas/domains', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { domain } = await c.req.json();
  const clean = normalizeDomain(domain);
  if (!DOMAIN_REGEX.test(clean)) {
    return c.json({ error: 'Invalid domain name. Use a root or subdomain like app.example.com' }, 400);
  }

  // Enforce one custom hostname per workspace for SaaS dashboard branding.
  // Upgrade later if you want to support multiple.
  const existing: any = await c.env.DB.prepare(
    'SELECT id FROM custom_hostnames WHERE workspace_id = ?'
  ).bind(workspaceId).first();
  if (existing) {
    return c.json({ error: 'A custom domain is already configured for this workspace. Remove it first.' }, 400);
  }

  try {
    const cf = await createCustomHostname(c.env, clean);
    const hostnameId = cf?.id;
    const validation = getHostnameValidationRecord(cf);

    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO custom_hostnames
         (id, workspace_id, domain, hostname_id, status, verification_code, fallback_origin)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      workspaceId,
      clean,
      hostnameId || null,
      mapCfStatus(cf?.status),
      validation?.content || null,
      getFallbackOrigin(c.env)
    ).run();

    const row: any = await c.env.DB.prepare('SELECT * FROM custom_hostnames WHERE id = ?').bind(id).first();
    return c.json({
      success: true,
      hostname: {
        ...row,
        instructions: {
          type: 'CNAME',
          name: row.domain,
          content: getFallbackOrigin(c.env),
          txt: validation || null,
          note: 'Point this DNS record to the fallback origin. HTTPS/SSL will be provisioned automatically.',
        },
      },
    });
  } catch (e: any) {
    console.error('[SaaS] Failed to create custom hostname:', e);
    return c.json({ error: e.message || 'Failed to add custom domain' }, 502);
  }
});

// ------------------------------------------
// List workspace custom hostnames
// ------------------------------------------
router.get('/api/saas/domains', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { limit, offset } = pagination(c, 50);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM custom_hostnames WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).bind(workspaceId, limit, offset).all();

  const items = (results || []).map((row: any) => ({
    ...row,
    instructions: {
      type: 'CNAME',
      name: row.domain,
      content: row.fallback_origin || getFallbackOrigin(c.env),
    },
  }));

  return c.json({ hostnames: items });
});

// ------------------------------------------
// Verify / refresh custom hostname status from Cloudflare
// ------------------------------------------
router.post('/api/saas/domains/:id/verify', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const id = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const row: any = await c.env.DB.prepare(
    'SELECT * FROM custom_hostnames WHERE id = ? AND workspace_id = ?'
  ).bind(id, workspaceId).first();
  if (!row) return c.json({ error: 'Hostname not found' }, 404);

  try {
    let status = row.status;
    let hostnameId = row.hostname_id;
    let verificationCode: string | null = row.verification_code;

    if (hostnameId) {
      const cf = await getCustomHostname(c.env, hostnameId);
      status = mapCfStatus(cf?.status);
      verificationCode = getHostnameValidationRecord(cf)?.content || verificationCode;
    }

    await c.env.DB.prepare(
      'UPDATE custom_hostnames SET status = ?, verification_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(status, verificationCode, id).run();

    const fresh: any = await c.env.DB.prepare('SELECT * FROM custom_hostnames WHERE id = ?').bind(id).first();
    return c.json({
      success: true,
      hostname: {
        ...fresh,
        instructions: {
          type: 'CNAME',
          name: fresh.domain,
          content: fresh.fallback_origin || getFallbackOrigin(c.env),
          txt: fresh.verification_code ? { type: 'TXT', name: fresh.domain, content: fresh.verification_code } : null,
        },
        active: status === 'active',
      },
    });
  } catch (e: any) {
    console.error('[SaaS] Verify failed:', e);
    return c.json({ error: e.message || 'Failed to verify domain' }, 502);
  }
});

// ------------------------------------------
// Delete a custom hostname
// ------------------------------------------
router.delete('/api/saas/domains/:id', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const id = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const row: any = await c.env.DB.prepare(
    'SELECT * FROM custom_hostnames WHERE id = ? AND workspace_id = ?'
  ).bind(id, workspaceId).first();
  if (!row) return c.json({ error: 'Hostname not found' }, 404);

  try {
    if (row.hostname_id) {
      await deleteCustomHostname(c.env, row.hostname_id).catch((e: any) => {
        // Ignore already-deleted errors
        console.warn('[SaaS] CF delete warning:', e?.message || e);
      });
    }
  } catch (e: any) {
    console.error('[SaaS] Delete failed:', e);
  }

  await c.env.DB.prepare('DELETE FROM custom_hostnames WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

export default router;
