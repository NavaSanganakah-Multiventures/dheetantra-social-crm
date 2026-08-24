// ==========================================
// Shared helpers extracted from index.ts so route modules and the worker
// entry point can reuse them without circular imports.
// ==========================================

import { getCookie } from 'hono/cookie';

// ---------------------------------------------------------------------------
// Auth middleware — validates KV session + workspace membership, attaches
// user and workspaceRole to the Hono context.
// ---------------------------------------------------------------------------

export async function authMiddleware(c: any, next: any) {
  const sessionId = getCookie(c, 'auth_session');
  if (!sessionId) {
    return c.json({ error: 'Unauthorized: No session found' }, 401);
  }

  let user = null;
  if (c.env.SECRETS_KV) {
    const userDataStr = await c.env.SECRETS_KV.get(`SESSION:${sessionId}`);
    if (userDataStr) {
      user = JSON.parse(userDataStr);
    }
  }

  if (!user) {
    return c.json({ error: 'Unauthorized: Invalid or expired session' }, 401);
  }

  const workspaceId = c.req.header('x-workspace-id');
  if (workspaceId && c.env.DB) {
    // Check if the user is a member of the requested workspace
    const member = await c.env.DB.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?').bind(workspaceId, user.id).first();
    if (!member) {
      return c.json({ error: 'Forbidden: You do not have access to this workspace' }, 403);
    }
    // Attach workspace role to context
    c.set('workspaceRole', member.role);
  }

  c.set('user', user);
  await next();
}

// ---------------------------------------------------------------------------
// Pagination helper — parse `limit`/`offset` query params with sane bounds.
// ---------------------------------------------------------------------------

export function pagination(c: any, defaultLimit = 200, maxLimit = 1000) {
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') || String(defaultLimit), 10) || defaultLimit, 1), maxLimit);
  const offset = Math.max(parseInt(c.req.query('offset') || '0', 10) || 0, 0);
  return { limit, offset };
}

// ---------------------------------------------------------------------------
// RBAC guard — workspace_members.role based (set by authMiddleware).
// ---------------------------------------------------------------------------

export function requireRole(...roles: string[]) {
  const allowed = roles.length ? roles : ['owner', 'admin'];
  return async (c: any, next: any) => {
    const role = c.get('workspaceRole');
    if (!role) {
      // authMiddleware only sets workspaceRole when an x-workspace-id header is
      // present and the user belongs to that workspace. If we reach here with no
      // role, the caller likely forgot to send (or sent an empty) workspace id.
      const workspaceId = c.req.header('x-workspace-id');
      if (!workspaceId) {
        return c.json({ error: 'Bad Request: x-workspace-id header is required to determine workspace role' }, 400);
      }
      return c.json({ error: 'Forbidden: workspace role not resolved' }, 403);
    }
    if (!allowed.includes(role)) {
      return c.json({ error: 'Forbidden: only ' + allowed.join('/') + ' can perform this action' }, 403);
    }
    await next();
  };
}

// ---------------------------------------------------------------------------
// Validation regexes + domain row parser
// ---------------------------------------------------------------------------

export const DOMAIN_REGEX = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseDomain(d: any) {
  return {
    ...d,
    nameservers: d.nameservers ? JSON.parse(d.nameservers) : [],
    verification_records: d.verification_records ? JSON.parse(d.verification_records) : [],
    mx_records: d.mx_records ? JSON.parse(d.mx_records) : [],
    spf_records: d.spf_record ? JSON.parse(d.spf_record) : [],
    dkim_records: d.dkim_records ? JSON.parse(d.dkim_records) : [],
    dmarc_records: d.dmarc_record ? JSON.parse(d.dmarc_record) : [],
    pending_records: d.pending_records ? JSON.parse(d.pending_records) : [],
  };
}

// ---------------------------------------------------------------------------
// Email rate limiting / plan quotas / domain rate limits
// ---------------------------------------------------------------------------

export async function checkEmailRateLimit(env: any, workspaceId: string): Promise<{ ok: boolean; error?: string }> {
  const bucket = Math.floor(Date.now() / 60000);
  const windowKey = `${workspaceId}:${bucket}`;
  try {
    // Best-effort cleanup of expired windows (table stays tiny)
    await env.DB.prepare("DELETE FROM email_rate_limits WHERE created_at < datetime('now', '-5 minutes')").run();
    const row: any = await env.DB.prepare(
      `INSERT INTO email_rate_limits (window_key, workspace_id, count) VALUES (?, ?, 1)
       ON CONFLICT(window_key) DO UPDATE SET count = count + 1
       RETURNING count`
    ).bind(windowKey, workspaceId).first();
    if (row && row.count > 60) {
      return { ok: false, error: 'Rate limit exceeded. Try again later.' };
    }
    return { ok: true };
  } catch (e) {
    // Fail open if the limiter itself is unavailable so sends are not blocked
    console.error('[Email] Rate limiter error:', e);
    return { ok: true };
  }
}

export interface PlanLimits {
  email_monthly_limit: number;
  max_domains: number;
  max_mailboxes_per_domain: number;
  allow_email_send: boolean;
  pay_as_you_go_rate: number;
}

export const DEFAULT_PLAN_LIMITS: PlanLimits = {
  email_monthly_limit: 100,
  max_domains: 1,
  max_mailboxes_per_domain: 3,
  allow_email_send: true,
  pay_as_you_go_rate: 0,
};

export const YEAR_MONTH = () => new Date().toISOString().slice(0, 7);

export async function getWorkspacePlanLimits(env: any, workspaceId: string): Promise<PlanLimits> {
  try {
    const row: any = await env.DB.prepare(
      `SELECT COALESCE(p.limits_json, '{}') AS limits_json, COALESCE(p.pay_as_you_go_rate, 0) AS pay_as_you_go_rate
       FROM workspaces w LEFT JOIN plans p ON w.plan_id = p.id WHERE w.id = ?`
    ).bind(workspaceId).first();
    const parsed: Partial<PlanLimits> = row?.limits_json ? JSON.parse(row.limits_json) : {};
    return { ...DEFAULT_PLAN_LIMITS, ...parsed, pay_as_you_go_rate: row?.pay_as_you_go_rate ?? 0 };
  } catch (e) {
    console.error('[Billing] Failed to load plan limits:', e);
    return DEFAULT_PLAN_LIMITS;
  }
}

export async function checkEmailPlanQuota(env: any, workspaceId: string): Promise<{ ok: boolean; isOverage: boolean; monthlyLimit: number; remaining: number; overageRate: number; error?: string }> {
  const limits = await getWorkspacePlanLimits(env, workspaceId);
  if (!limits.allow_email_send) {
    return { ok: false, isOverage: false, monthlyLimit: 0, remaining: 0, overageRate: 0, error: 'Email sending is not enabled on your current plan.' };
  }
  if (limits.email_monthly_limit <= 0) {
    return { ok: false, isOverage: false, monthlyLimit: 0, remaining: 0, overageRate: 0, error: 'Email quota is not available. Upgrade your plan.' };
  }

  try {
    const usage: any = await env.DB.prepare(
      'SELECT emails_sent, overage_emails FROM workspace_email_usage WHERE workspace_id = ? AND year_month = ?'
    ).bind(workspaceId, YEAR_MONTH()).first();
    const sent = usage?.emails_sent || 0;
    const remaining = Math.max(0, limits.email_monthly_limit - sent);
    if (remaining > 0) {
      return { ok: true, isOverage: false, monthlyLimit: limits.email_monthly_limit, remaining, overageRate: limits.pay_as_you_go_rate };
    }
    if (limits.pay_as_you_go_rate > 0) {
      return { ok: true, isOverage: true, monthlyLimit: limits.email_monthly_limit, remaining: 0, overageRate: limits.pay_as_you_go_rate };
    }
    return { ok: false, isOverage: false, monthlyLimit: limits.email_monthly_limit, remaining: 0, overageRate: 0, error: `Monthly email limit (${limits.email_monthly_limit}) reached. Upgrade to send more.` };
  } catch (e) {
    console.error('[Billing] Quota check failed:', e);
    // Fail open so emails are not hard-blocked by billing schema issues
    return { ok: true, isOverage: false, monthlyLimit: 0, remaining: 0, overageRate: 0 };
  }
}

export async function incrementEmailUsage(env: any, workspaceId: string, isOverage: boolean) {
  try {
    const col = isOverage ? 'overage_emails' : 'emails_sent';
    await env.DB.prepare(
      `INSERT INTO workspace_email_usage (workspace_id, year_month, emails_sent, overage_emails, updated_at)
       VALUES (?, ?, 0, 0, CURRENT_TIMESTAMP)
       ON CONFLICT(workspace_id, year_month) DO UPDATE SET ${col} = ${col} + 1, updated_at = CURRENT_TIMESTAMP`
    ).bind(workspaceId, YEAR_MONTH()).run();
  } catch (e) {
    console.error('[Billing] Failed to increment usage:', e);
  }
}

export async function checkDomainAddRateLimit(env: any, workspaceId: string): Promise<{ ok: boolean; error?: string }> {
  const today = new Date().toISOString().slice(0, 10);
  const windowKey = `${workspaceId}:${today}`;
  try {
    // Keep table small
    await env.DB.prepare("DELETE FROM domain_add_rate_limits WHERE created_at < date('now', '-2 days')").run();
    const row: any = await env.DB.prepare(
      `INSERT INTO domain_add_rate_limits (window_key, workspace_id, count) VALUES (?, ?, 1)
       ON CONFLICT(window_key) DO UPDATE SET count = count + 1
       RETURNING count`
    ).bind(windowKey, workspaceId).first();
    if (row && row.count > 5) {
      return { ok: false, error: 'Daily domain add limit reached (max 5 per workspace). Try again tomorrow.' };
    }
    return { ok: true };
  } catch (e) {
    console.error('[Domain] Add rate limit error:', e);
    return { ok: true };
  }
}

// ---------------------------------------------------------------------------
// Email abuse monitoring (auto-suspend)
// ---------------------------------------------------------------------------

export const ABUSE_SUSPEND_FAILURES = 10;
export const ABUSE_SUSPEND_FAILURE_RATIO = 0.5;
// Per-domain verdict cache TTL (seconds). Keeps the 24h scan query off the
// hot send path; detection may lag by at most this window.
export const ABUSE_CACHE_TTL = 60;

export function abuseCacheKey(domainId: string): string {
  return `email_abuse:${domainId}`;
}

// Notify every workspace member (FCM push + email) when a domain is first
// auto-suspended so the owner is not surprised by suddenly failing sends.
export async function notifyDomainSuspended(env: any, domainId: string, reason: string) {
  try {
    const domain: any = await env.DB.prepare('SELECT workspace_id, domain_name FROM domains WHERE id = ?').bind(domainId).first();
    if (!domain) return;
    const members: any = await env.DB.prepare('SELECT user_id FROM workspace_members WHERE workspace_id = ?').bind(domain.workspace_id).all();
    const userIds = (members.results || []).map((m: any) => m.user_id);
    if (userIds.length === 0) return;

    const placeholders = userIds.map(() => '?').join(',');
    const title = `Email domain ${domain.domain_name} suspended`;
    const body = `DheeTantra auto-suspended "${domain.domain_name}" due to high send failures. Contact support to restore it.`;

    const tokens: any = await env.DB.prepare(`SELECT token FROM fcm_tokens WHERE user_id IN (${placeholders})`).bind(...userIds).all();
    if (tokens.results && tokens.results.length > 0) {
      const { sendPushNotification } = await import('../lib/fcm');
      for (const row of tokens.results) {
        await sendPushNotification(env, row.token, title, body, { workspaceId: domain.workspace_id, domain: domain.domain_name });
      }
    }

    if (env.EMAIL_SENDER && typeof env.EMAIL_SENDER.send === 'function') {
      const emails: any = await env.DB.prepare(`SELECT email FROM users WHERE id IN (${placeholders})`).bind(...userIds).all();
      if (emails.results && emails.results.length > 0) {
        const { EmailMessage } = await import('cloudflare:email');
        // users.email is attacker-controlled (send-otp stores it with no format
        // validation), so every header-interpolated value must go through
        // sanitizeHeaderValue to block CRLF header injection into the raw email.
        const { sanitizeHeaderValue } = await import('./services/emailService');
        const senderEmail = sanitizeHeaderValue(env.EMAIL_SENDER_ADDRESS || 'dheetantra@navasanganakah.com');
        const safeTitle = sanitizeHeaderValue(title);
        const safeBody = sanitizeHeaderValue(body);
        const safeReason = sanitizeHeaderValue(reason);
        for (const row of emails.results) {
          const safeTo = sanitizeHeaderValue(row.email || '');
          const rawEmail = `From: DheeTantra <${senderEmail}>\r\nTo: ${safeTo}\r\nSubject: [DheeTantra] ${safeTitle}\r\n\r\n${safeBody}\r\n\r\nReason: ${safeReason}\r\n\r\nOpen the admin panel to review unsuspended domains.`;
          await env.EMAIL_SENDER.send(new EmailMessage(senderEmail, safeTo, rawEmail));
        }
      }
    }
  } catch (e) {
    // Notifications are best-effort; never let them fail the abuse gate itself
    console.error('[Email] Failed to notify domain suspension:', e);
  }
}

// Single-flight: concurrent requests that miss the cache share one scan instead
// of each re-running the aggregate query on the hot path.
const abuseScanInFlight = new Map<string, Promise<{ ok: boolean; message?: string }>>();

// The 24h scan. Window start is max(last 24h, abuse_reset_at) so an admin
// unsuspend gives the domain a fresh baseline — otherwise the still-hot old
// failures would deterministically re-suspend it on the very next send.
export async function scanDomainAbuse(env: any, domainId: string, ctx?: any): Promise<{ ok: boolean; message?: string }> {
  const stats: any = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN L.status = 'failed' THEN 1 ELSE 0 END), 0) AS failed
     FROM email_send_logs L
     JOIN domains D ON D.id = L.domain_id
     WHERE L.domain_id = ? AND L.created_at >= COALESCE(D.abuse_reset_at, datetime('now', '-1 day'))`
  ).bind(domainId).first();
  const total = stats?.total || 0;
  const failed = stats?.failed || 0;

  if (total > 0 && failed >= ABUSE_SUSPEND_FAILURES && failed / total >= ABUSE_SUSPEND_FAILURE_RATIO) {
    // Idempotent: only flip the row the first time it crosses the threshold
    const upd: any = await env.DB.prepare(
      `UPDATE domains SET status = 'suspended', error_message = ?, last_checked_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status != 'suspended'`
    ).bind(`Auto-suspended: ${failed} of ${total} recent sends failed in 24h`, domainId).run();
    const reason = `Auto-suspended: ${failed} of ${total} recent sends failed in 24h`;
    if ((upd?.meta?.changes ?? 0) > 0 && ctx) {
      ctx.waitUntil(notifyDomainSuspended(env, domainId, reason));
    }
    if (env.SECRETS_KV) {
      // Fire-and-forget: the domains.status flip above is the authoritative
      // gate; a slow cache write must not add latency to the send path.
      env.SECRETS_KV.put(abuseCacheKey(domainId), 'blocked', { expirationTtl: ABUSE_CACHE_TTL })
        .catch((e: any) => console.error('[Email] Abuse cache put failed:', e));
    }
    return { ok: false, message: `Domain auto-suspended: ${failed} of ${total} recent sends failed. Contact support to restore it.` };
  }

  if (env.SECRETS_KV) {
    env.SECRETS_KV.put(abuseCacheKey(domainId), 'ok', { expirationTtl: ABUSE_CACHE_TTL })
      .catch((e: any) => console.error('[Email] Abuse cache put failed:', e));
  }
  return { ok: true };
}

export async function checkDomainAbuse(env: any, domainId: string, ctx?: any): Promise<{ ok: boolean; message?: string }> {
  try {
    // KV cache: healthy domains skip the DB scan entirely between verdicts
    if (env.SECRETS_KV) {
      const cached = await env.SECRETS_KV.get(abuseCacheKey(domainId));
      if (cached === 'blocked') {
        return { ok: false, message: 'Domain auto-suspended: high recent send failures. Contact support to restore it.' };
      }
      if (cached === 'ok') return { ok: true };
    }

    // Single-flight the miss path: concurrent requests share one scan
    let pending = abuseScanInFlight.get(domainId);
    if (!pending) {
      pending = scanDomainAbuse(env, domainId, ctx).finally(() => {
        abuseScanInFlight.delete(domainId);
      });
      abuseScanInFlight.set(domainId, pending);
    }
    return pending;
  } catch (e) {
    // Fail open: the abuse check must never block sends because of a DB hiccup
    console.error('[Email] Abuse check error:', e);
    return { ok: true };
  }
}

// ---------------------------------------------------------------------------
// Email helpers
// ---------------------------------------------------------------------------

export function parseEmailMediaJson(value: string | null): { subject?: string; html?: string; to?: string; messageId?: string; attachments?: any[]; unverified?: boolean } {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch { /* ignore */ }
  return {};
}

export function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
