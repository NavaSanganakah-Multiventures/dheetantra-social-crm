import { Hono } from 'hono';
import { Env } from '../types';
import {
  requireRole, pagination, DOMAIN_REGEX, EMAIL_REGEX, parseDomain,
  checkEmailRateLimit, checkEmailPlanQuota, incrementEmailUsage,
  checkDomainAddRateLimit, getWorkspacePlanLimits, checkDomainAbuse,
  parseEmailMediaJson, stripHtmlTags,
} from '../shared';

// Email service is a paid add-on; domains may only be added after an active
// email add-on subscription exists for the workspace.
async function getActiveEmailAddon(env: any, workspaceId: string): Promise<any | null> {
  const now = Math.floor(Date.now() / 1000);
  const subscription: any = await env.DB.prepare(
    `SELECT * FROM addon_subscriptions
       WHERE workspace_id = ? AND addon_id LIKE 'email-addon-%'
         AND status = 'active'
         AND (current_period_end IS NULL OR current_period_end > ?)
       ORDER BY domains_allowed DESC
       LIMIT 1`
  ).bind(workspaceId, now).first();
  if (subscription) return subscription;

  // Fall back to plan-based limits. Every non-trivial plan already encodes
  // how many email domains it includes via limits_json.max_domains. This lets
  // a workspace add domains immediately after admin assigns a plan or a paid
  // subscription activates, without forcing a separate add-on purchase.
  const { getWorkspacePlanLimits } = await import('../shared');
  const limits = await getWorkspacePlanLimits(env, workspaceId);
  if ((limits.max_domains || 0) > 0) {
    return {
      id: 'plan-email-addon',
      workspace_id: workspaceId,
      addon_id: 'email-addon-plan',
      status: 'active',
      domains_allowed: limits.max_domains,
      current_period_end: null,
    };
  }
  return null;
}async function countEmailDomains(env: any, workspaceId: string): Promise<number> {
  const row: any = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM domains WHERE workspace_id = ?'
  ).bind(workspaceId).first();
  return row?.count || 0;
}


const router = new Hono<{ Bindings: Env; Variables: { user: any; workspaceRole?: string } }>();

router.post('/api/domains', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const user = c.get('user') as any;
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { domainName, setupMode = 'full', defaultEmailPrefix = 'info', forwardTo } = await c.req.json();
  if (!domainName) return c.json({ error: 'Domain is required' }, 400);

  let clean = String(domainName).toLowerCase().trim();
  try {
    if (clean.startsWith('http')) clean = new URL(clean).hostname;
  } catch (e) { /* keep raw string */ }
  clean = clean.replace(/\/+$/, '').replace(/^www\./, '');

  if (!DOMAIN_REGEX.test(clean)) {
    return c.json({ error: 'Invalid domain name. Use a root domain like example.com' }, 400);
  }

  const mode = setupMode === 'cname' ? 'cname' : 'full';
  const cleanPrefix = String(defaultEmailPrefix || 'info').toLowerCase().trim();
  if (!/^[a-z0-9._+-]+$/.test(cleanPrefix) || cleanPrefix.length > 64) {
    return c.json({ error: 'Invalid default mailbox name. Use letters, numbers, dots, dashes, underscores or plus.' }, 400);
  }

  const safeForwardTo = forwardTo ? String(forwardTo).trim().toLowerCase() : null;
  if (safeForwardTo && !EMAIL_REGEX.test(safeForwardTo)) {
    return c.json({ error: 'Invalid forward-to email address.' }, 400);
  }

  // Email service requires an active paid add-on subscription.
  let addon: any;
  try {
    addon = await getActiveEmailAddon(c.env, workspaceId);
  } catch (e: any) {
    // Most likely cause: the email-gating migration (0019_saas_email_gating)
    // has not been applied to the D1 database, so the addon_subscriptions
    // table is missing. Surface a clear, actionable JSON error instead of an
    // unhandled non-JSON 500 (which the UI showed as an opaque parse failure).
    console.error('[Email] Addon subscription lookup failed:', e);
    return c.json({
      error: 'Email add-on billing is not initialized on the database. Run database migrations and redeploy.',
      code: 'E_EMAIL_ADDON_UNAVAILABLE',
      action: 'run_migrations',
      detail: String(e?.message || e),
    }, 500);
  }
  if (!addon) {
    return c.json({
      error: 'Email service is a paid add-on. Purchase an email add-on plan first.',
      code: 'E_EMAIL_ADDON_REQUIRED',
      action: 'purchase_addon',
    }, 402);
  }

  const domainCount = await countEmailDomains(c.env, workspaceId);
  if (domainCount >= addon.domains_allowed) {
    return c.json({
      error: `Email domain limit reached (${domainCount}/${addon.domains_allowed}). Upgrade your email add-on.`,
      code: 'E_EMAIL_ADDON_LIMIT',
      action: 'upgrade_addon',
    }, 400);
  }

  // Daily rate limit
  const addRate = await checkDomainAddRateLimit(c.env, workspaceId);
  if (!addRate.ok) return c.json({ error: addRate.error, code: 'E_DOMAIN_RATE_LIMIT' }, 429);

  // The email add-on is the authoritative domain entitlement. The legacy
  // plan-based max_domains defaults to 1 and must NOT block an add-on that
  // allows more domains (e.g. add-on=5 vs plan default=1). Take the higher.
  const limits = await getWorkspacePlanLimits(c.env, workspaceId);
  const effectiveMaxDomains = Math.max(addon.domains_allowed || 0, limits.max_domains || 0);
  if (domainCount >= effectiveMaxDomains) {
    return c.json({ error: `Domain limit reached (max ${effectiveMaxDomains}). Upgrade to add more domains.`, code: 'E_DOMAIN_LIMIT' }, 400);
  }

  try {
    const existing: any = await c.env.DB.prepare('SELECT * FROM domains WHERE workspace_id = ? AND domain_name = ?')
      .bind(workspaceId, clean).first();
    if (existing) return c.json({ error: 'Domain is already registered for this workspace' }, 400);

    const id = crypto.randomUUID();
    // Domain is submitted for admin review; Cloudflare onboarding starts only after approval
    await c.env.DB.prepare(`INSERT INTO domains
      (id, workspace_id, domain_name, setup_mode, status, review_status, billing_status, subscription_id, requested_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, workspaceId, clean, mode, 'pending', 'pending_review', 'paid', (addon.id && addon.id !== 'plan-email-addon') ? addon.id : null, user?.id || null).run();

    const emailId = crypto.randomUUID();
    const emailAddress = `${cleanPrefix}@${clean}`;
    await c.env.DB.prepare(
      'INSERT INTO domain_emails (id, domain_id, local_part, email_address, forward_to, is_default) VALUES (?, ?, ?, ?, ?, 1)'
    ).bind(emailId, id, cleanPrefix, emailAddress, safeForwardTo).run();

    const row: any = await c.env.DB.prepare('SELECT * FROM domains WHERE id = ?').bind(id).first();
    return c.json({
      success: true,
      domain: parseDomain(row),
      email_address: emailAddress,
      status: 'pending_admin_review',
      message: 'Domain submitted for admin review. Cloudflare onboarding will start after approval.'
    });
  } catch (e: any) {
    if (String(e.message).includes('UNIQUE constraint')) return c.json({ error: 'Domain is already registered' }, 400);
    console.error('[Email] Add domain error:', e);
    return c.json({ error: e.message }, 500);
  }
});

// List Custom Domains
router.get('/api/domains', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { limit, offset } = pagination(c, 200);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM domains WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).bind(workspaceId, limit, offset).all();

  return c.json({ domains: (results || []).map(parseDomain) });
});

// Re-check domain verification status + complete onboarding
router.post('/api/domains/:id/verify', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const id = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const row: any = await c.env.DB.prepare('SELECT * FROM domains WHERE id = ? AND workspace_id = ?')
    .bind(id, workspaceId).first();
  if (!row) return c.json({ error: 'Domain not found' }, 404);
  if (row.review_status !== 'approved') {
    return c.json({ error: 'Domain is pending admin approval. Onboarding not started yet.', code: 'E_DOMAIN_NOT_APPROVED' }, 400);
  }

  const { checkDomain } = await import('../services/emailService');
  // Full verification runs several Cloudflare calls and can take 5-15s.
  // Run it SYNCHRONOUSLY and return the FRESH status so the UI never shows a
  // stale (pending) row after the user presses "Ã Â¤ÂÃ Â¤Â¾Ã Â¤ÂÃ Â¤ÂÃ Â¥ÂÃ Â¤Â". Previously the check
  // ran in the background (waitUntil) while the response returned the OLD row,
  // so a verified/active domain kept displaying "Pending Verification".
  let verifyError: any = null;
  const fresh: any = await checkDomain(c.env, row).catch((e: any) => {
    verifyError = e;
    console.error('[Email] Verification failed for', row.domain_name, e);
    return null;
  });
  if (!fresh) {
    // Real check failure: surface the ACTUAL error instead of a generic string
    // so the failure is diagnosable from the UI (timeout, Cloudflare error,
    // D1 error, ...).
    return c.json({
      success: false,
      error: `Verification failed: ${verifyError?.message || 'unknown error'}`,
      code: 'E_VERIFY_FAILED',
    }, 502);
  }
  const parsed = parseDomain({ ...row, ...fresh });
  if (fresh.status !== 'active') {
    // Zone exists but Cloudflare has not flipped it to active yet. This is
    // normal right after a nameserver change (propagation + CF polling can
    // take minutes to hours) Ã¢ÂÂ return a clear message so the UI does not look
    // like a failure.
    return c.json({
      success: true,
      domain: parsed,
      pending: true,
      message: 'Cloudflare अभी nameserver verify कर रहा है। बदलाव के बाद active होने में कुछ मिनट से कुछ घंटे लग सकते हैं — 10-15 मिनट बाद फिर जांचें।',
    });
  }
  return c.json({ success: true, domain: parsed });
});

// Remove Domain (deletes Cloudflare zone + row)
router.delete('/api/domains/:id', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const id = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const row: any = await c.env.DB.prepare('SELECT * FROM domains WHERE id = ? AND workspace_id = ?')
    .bind(id, workspaceId).first();
  if (!row) return c.json({ error: 'Domain not found' }, 404);

  const { removeDomain } = await import('../services/emailService');
  const { deleted, errors } = await removeDomain(c.env, row);
  if (!deleted) {
    // Cloudflare zone deletion failed or could not be confirmed (network,
    // rate-limit, 5xx, permission, missing credentials). The row is kept Ã¢ÂÂ
    // a live zone must never be orphaned Ã¢ÂÂ so the user can fix the cause
    // (e.g. remove the zone in Cloudflare) and retry.
    return c.json({ success: false, error: 'Cloudflare cleanup failed — domain kept for retry', errors }, 502);
  }
  // Deleted. errors may still contain warnings (rule already gone, missing
  // credentials) Ã¢ÂÂ surface them but the domain is removed.
  return c.json({ success: true, errors });
});

// ==========================================
// DOMAIN MAILBOXES (email addresses)
// ==========================================

// Fetch Domain Emails / Mailboxes
router.get('/api/domain-emails/:domainId', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const domainId = c.req.param('domainId');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const domain: any = await c.env.DB.prepare('SELECT id FROM domains WHERE id = ? AND workspace_id = ?')
    .bind(domainId, workspaceId).first();
  if (!domain) return c.json({ error: 'Domain not found' }, 404);

  const { limit, offset } = pagination(c, 100);
  const { results } = await c.env.DB.prepare('SELECT * FROM domain_emails WHERE domain_id = ? ORDER BY is_default DESC, created_at ASC LIMIT ? OFFSET ?')
    .bind(domainId, limit, offset).all();
  return c.json({ emails: results });
});

// Create Mailbox
router.post('/api/domain-emails', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { domainId, localPart, forwardTo, isDefault } = await c.req.json();
  if (!domainId || !localPart) return c.json({ error: 'domainId and localPart are required' }, 400);

  const domain: any = await c.env.DB.prepare('SELECT * FROM domains WHERE id = ? AND workspace_id = ?')
    .bind(domainId, workspaceId).first();
  if (!domain) return c.json({ error: 'Domain not found' }, 404);
  if (domain.review_status !== 'approved') {
    return c.json({ error: 'Domain is pending admin approval. Add mailbox after approval.', code: 'E_DOMAIN_NOT_APPROVED' }, 400);
  }

  const cleanLocal = String(localPart).toLowerCase().trim();
  if (!/^[a-z0-9._+-]+$/.test(cleanLocal)) {
    return c.json({ error: 'Invalid local part. Use letters, numbers, dots, dashes, underscores or plus.' }, 400);
  }
  const emailAddress = `${cleanLocal}@${domain.domain_name}`;

  // Plan-based max mailboxes per domain
  const limits = await getWorkspacePlanLimits(c.env, workspaceId);
  const mailboxCount: any = await c.env.DB.prepare('SELECT COUNT(*) as count FROM domain_emails WHERE domain_id = ?').bind(domainId).first();
  if (mailboxCount && mailboxCount.count >= limits.max_mailboxes_per_domain) {
    return c.json({ error: `Mailbox limit reached for this domain (max ${limits.max_mailboxes_per_domain}). Upgrade your plan.`, code: 'E_MAILBOX_LIMIT' }, 400);
  }

  try {
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      'INSERT INTO domain_emails (id, domain_id, local_part, email_address, forward_to, is_default) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, domainId, cleanLocal, emailAddress, forwardTo || null, isDefault ? 1 : 0).run();
    return c.json({ success: true, email: { id, email_address: emailAddress, forward_to: forwardTo || null } });
  } catch (e: any) {
    if (String(e.message).includes('UNIQUE constraint')) {
      return c.json({ error: 'This email address already exists for this domain' }, 400);
    }
    console.error('[Email] Create mailbox error:', e);
    return c.json({ error: e.message }, 500);
  }
});

// Delete Mailbox
router.delete('/api/domain-emails/:id', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const id = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const mailbox: any = await c.env.DB.prepare(
    'SELECT de.id FROM domain_emails de JOIN domains d ON de.domain_id = d.id WHERE de.id = ? AND d.workspace_id = ?'
  ).bind(id, workspaceId).first();
  if (!mailbox) return c.json({ error: 'Mailbox not found' }, 404);

  await c.env.DB.prepare('DELETE FROM domain_emails WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// ==========================================
// EMAIL SENDING (send_email binding)
// ==========================================

// Atomic per-workspace email rate limit (60 emails / minute) backed by D1.
// INSERT ... ON CONFLICT ... RETURNING is a single atomic statement in SQLite,
// so concurrent sends cannot all pass the cap like a KV read-modify-write can.

// Send an email from a verified domain of the workspace
router.post('/api/email/send', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { to, subject, html, text, fromAddress, templateType, variables } = await c.req.json();
  if (!to || !subject) return c.json({ error: 'to and subject are required' }, 400);
  if (!EMAIL_REGEX.test(to)) return c.json({ error: 'Invalid recipient email' }, 400);
  // Headers must never contain line breaks (CRLF header injection)
  if (/\r|\n/.test(String(subject))) return c.json({ error: 'Invalid subject' }, 400);

  const rate = await checkEmailRateLimit(c.env, workspaceId);
  if (!rate.ok) return c.json({ error: rate.error }, 429);

  const quota = await checkEmailPlanQuota(c.env, workspaceId);
  if (!quota.ok) return c.json({ error: quota.error, code: 'E_QUOTA_EXCEEDED' }, 429);

  const { resolveFromAddress, sendEmail, logEmailSend, renderTemplate, stripHtml, storeOutboundEmail } = await import('../services/emailService');

  let resolved: any;
  try {
    resolved = await resolveFromAddress(c.env, workspaceId, fromAddress);
  } catch (e: any) {
    return c.json({ error: e.message, code: e.code || 'E_FROM_INVALID' }, e.status || 400);
  }

  // Abuse monitoring: auto-suspended domains cannot send until an admin restores them
  const abuse = await checkDomainAbuse(c.env, resolved.domain.id, c.executionCtx);
  if (!abuse.ok) return c.json({ error: abuse.message, code: 'E_DOMAIN_SUSPENDED' }, 403);

  let bodyHtml = html || '';
  let bodyText = text || '';
  if (templateType) {
    const template: any = await c.env.DB.prepare('SELECT * FROM email_templates WHERE workspace_id = ? AND template_type = ?')
      .bind(workspaceId, templateType).first();
    if (template) {
      bodyHtml = renderTemplate(template.body_html, variables || {});
      if (!bodyText) bodyText = stripHtml(bodyHtml);
    }
  }
  if (!bodyHtml && !bodyText) return c.json({ error: 'Email body is required' }, 400);

  try {
    const result = await sendEmail(c.env, { to, from: resolved.fromEmail, subject, html: bodyHtml, text: bodyText });
    // Bookkeeping must never turn a delivered email into a failure response:
    // log/flag errors are swallowed (logged) and success is returned regardless
    try {
      await logEmailSend(c.env, {
        workspaceId, domainId: resolved.domain.id, fromEmail: resolved.fromEmail, toEmail: to,
        subject, status: 'sent', messageId: result.messageId,
      });
      await c.env.DB.prepare('UPDATE domains SET sending_onboarded = 1 WHERE id = ?').bind(resolved.domain.id).run();
      await incrementEmailUsage(c.env, workspaceId, quota.isOverage);
      await storeOutboundEmail(c.env, workspaceId, to, subject, bodyText, bodyHtml);
    } catch (bookkeepingErr) {
      console.error('[Email] Send bookkeeping failed (email was delivered):', bookkeepingErr);
    }
    return c.json({
      success: true,
      messageId: result.messageId,
      monthlyLimit: quota.monthlyLimit,
      remaining: Math.max(0, quota.remaining - 1),
      overage: quota.isOverage,
    });
  } catch (e: any) {
    try {
      await logEmailSend(c.env, {
        workspaceId, domainId: resolved.domain.id, fromEmail: resolved.fromEmail, toEmail: to,
        subject, status: 'failed', errorCode: e.code, errorMessage: e.message,
      });
    } catch (logErr) {
      console.error('[Email] Failed to log send error:', logErr);
    }
    return c.json({ success: false, error: e.message, code: e.code || 'E_SEND_FAILED' }, e.status || 500);
  }
});

// Test email for a domain (also detects Email Sending onboarding readiness)
router.post('/api/email/test', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { domainId, to } = await c.req.json();
  if (!domainId || !to) return c.json({ error: 'domainId and to are required' }, 400);
  if (!EMAIL_REGEX.test(to)) return c.json({ error: 'Invalid recipient email' }, 400);

  const rate = await checkEmailRateLimit(c.env, workspaceId);
  if (!rate.ok) return c.json({ error: rate.error }, 429);

  const quota = await checkEmailPlanQuota(c.env, workspaceId);
  if (!quota.ok) return c.json({ error: quota.error, code: 'E_QUOTA_EXCEEDED' }, 429);

  const row: any = await c.env.DB.prepare('SELECT * FROM domains WHERE id = ? AND workspace_id = ?')
    .bind(domainId, workspaceId).first();
  if (!row) return c.json({ error: 'Domain not found' }, 404);
  // Suspended must be checked BEFORE the generic not-active check, otherwise
  // suspended domains get the misleading "Domain is not active yet" error.
  if (row.status === 'suspended') {
    return c.json({ error: 'Domain suspended due to high send failures. Contact support to restore it.', code: 'E_DOMAIN_SUSPENDED' }, 403);
  }
  if (row.status !== 'active') {
    return c.json({ error: 'Domain is not active yet. Complete the DNS verification first.', code: 'E_DOMAIN_NOT_ACTIVE' }, 400);
  }
  const abuse = await checkDomainAbuse(c.env, row.id, c.executionCtx);
  if (!abuse.ok) return c.json({ error: abuse.message, code: 'E_DOMAIN_SUSPENDED' }, 403);

  // From must be a registered mailbox: prefer test@domain, else the default mailbox
  const mailbox: any = await c.env.DB.prepare('SELECT * FROM domain_emails WHERE domain_id = ? AND email_address = ? COLLATE NOCASE')
    .bind(row.id, `test@${row.domain_name}`).first()
    || await c.env.DB.prepare('SELECT * FROM domain_emails WHERE domain_id = ? ORDER BY is_default DESC, created_at ASC LIMIT 1').bind(row.id).first();
  if (!mailbox) {
    return c.json({ error: 'No mailbox configured for this domain. Create a mailbox first.', code: 'E_NO_MAILBOX' }, 400);
  }
  const fromEmail = mailbox.email_address;

  const { sendEmail, logEmailSend } = await import('../services/emailService');

  try {
    const result = await sendEmail(c.env, {
      to, from: fromEmail, subject: 'DheeTantra test email',
      text: `This is a test email from ${row.domain_name}. If you can read this, sending is working!`,
    });
    try {
      await logEmailSend(c.env, {
        workspaceId, domainId: row.id, fromEmail, toEmail: to,
        subject: 'DheeTantra test email', status: 'sent', messageId: result.messageId,
      });
      await c.env.DB.prepare('UPDATE domains SET sending_onboarded = 1 WHERE id = ?').bind(row.id).run();
      await incrementEmailUsage(c.env, workspaceId, quota.isOverage);
    } catch (bookkeepingErr) {
      console.error('[Email] Test-send bookkeeping failed (email was delivered):', bookkeepingErr);
    }
    return c.json({ success: true, messageId: result.messageId, monthlyLimit: quota.monthlyLimit, remaining: Math.max(0, quota.remaining - 1), overage: quota.isOverage });
  } catch (e: any) {
    try {
      await logEmailSend(c.env, {
        workspaceId, domainId: row.id, fromEmail, toEmail: to,
        subject: 'DheeTantra test email', status: 'failed', errorCode: e.code, errorMessage: e.message,
      });
    } catch (logErr) {
      console.error('[Email] Failed to log test-send error:', logErr);
    }
    return c.json({ success: false, error: e.message, code: e.code || 'E_SEND_FAILED' }, 400);
  }
});

// Send logs
router.get('/api/email/send-logs', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10) || 50, 200);
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM email_send_logs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?'
    ).bind(workspaceId, limit).all();
    return c.json({ logs: results });
  } catch (e) {
    // Fail open (empty list) so a schema/DB hiccup does not hard-500 the UI
    console.error('[Email] Failed to fetch send logs:', e);
    return c.json({ logs: [] });
  }
});

// All mailboxes of the workspace (single query for the compose From picker)
router.get('/api/email/mailboxes', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { limit, offset } = pagination(c, 100);
  const { results } = await c.env.DB.prepare(
    `SELECT de.id, de.email_address, de.forward_to, de.is_default, de.domain_id, d.domain_name, d.status AS domain_status
     FROM domain_emails de JOIN domains d ON de.domain_id = d.id
     WHERE d.workspace_id = ?
     ORDER BY d.created_at ASC, de.is_default DESC
     LIMIT ? OFFSET ?`
  ).bind(workspaceId, limit, offset).all();

  return c.json({ mailboxes: results });
});

// ==========================================
// EMAIL RECEIVE DIAGNOSTICS (one-click pipeline check)
// ==========================================

router.get('/api/email/diagnostics', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const out: any = { checkedAt: new Date().toISOString(), workspaceId };

  // 1. Domains in this workspace + onboarding state
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT id, domain_name, setup_mode, status, review_status, zone_id, routing_rule_id, sending_onboarded, error_message, last_checked_at
       FROM domains WHERE workspace_id = ? ORDER BY created_at DESC`
    ).bind(workspaceId).all();
    out.domains = (results || []).map((d: any) => ({
      domain: d.domain_name,
      setup_mode: d.setup_mode,
      status: d.status,
      review_status: d.review_status,
      zone_id: d.zone_id,
      has_zone_id: !!d.zone_id,
      has_routing_rule_id: !!d.routing_rule_id,
      sending_onboarded: !!d.sending_onboarded,
      error_message: d.error_message || null,
      last_checked_at: d.last_checked_at || null,
    }));
  } catch (e: any) {
    out.domains = [];
    out.domains_error = e.message;
  }

  // 1b. Was the maintenance cron actually running? (proves the scheduled
  // trigger fires; a missing marker means the cron never executed)
  try {
    const lastRun = await c.env.SECRETS_KV.get('EMAIL_MAINTENANCE_LAST_RUN');
    out.maintenance_cron = { last_run: lastRun || null };
  } catch (e: any) {
    out.maintenance_cron = { error: e.message };
  }

  // 2. KV credentials needed for Cloudflare onboarding
  try {
    const token = await c.env.SECRETS_KV.get('CLOUDFLARE_API_TOKEN');
    const accountId = await c.env.SECRETS_KV.get('CLOUDFLARE_ACCOUNT_ID');
    out.credentials = {
      CLOUDFLARE_API_TOKEN: token ? `SET (${token.slice(0, 6)}...${token.slice(-4)})` : 'MISSING',
      CLOUDFLARE_ACCOUNT_ID: accountId ? `SET (${accountId.slice(0, 6)}...)` : 'MISSING',
      hasBoth: !!(token && accountId),
    };
  } catch (e: any) {
    out.credentials = { error: e.message };
  }

  // 3. Live Cloudflare state for every domain that has a zone. Bounded
  //    concurrency + a per-request domain cap keep this well under the Worker's
  //    wall-time limit (3 CF calls per domain, parallelized).
  const { cfFetch } = await import('../services/cloudflareApi');
  const zoneDomains = (out.domains || []).filter((d: any) => d.has_zone_id);
  const CHECK_LIMIT = 20;
  const CONCURRENCY = 5;
  out.cloudflare = [];
  out.cloudflare_truncated = zoneDomains.length > CHECK_LIMIT;
  let cursor = 0;
  const checkOne = async (d: any) => {
    const entry: any = { domain: d.domain, zone_id: d.zone_id };
    const [zone, routing, rules]: any[] = await Promise.all([
      cfFetch(c.env, `/zones/${d.zone_id}`).catch((e: any) => ({ __error: e.message })),
      cfFetch(c.env, `/zones/${d.zone_id}/email/routing`).catch((e: any) => ({ __error: e.message })),
      cfFetch(c.env, `/zones/${d.zone_id}/email/routing/rules`).catch((e: any) => ({ __error: e.message })),
    ]);
    if (zone?.__error) entry.zone_error = zone.__error;
    else entry.zone_status = zone?.status || 'unknown';
    if (routing?.__error) entry.routing_error = routing.__error;
    else entry.routing_enabled = !!routing?.enabled;
    if (rules?.__error) {
      entry.rules_error = rules.__error;
    } else {
      const list: any[] = rules || [];
      entry.rules = list.map((r: any) => ({
        id: r.id,
        enabled: r.enabled !== false,
        matchers: r.matchers,
        actions: r.actions,
      }));
      const catchAll = list.find((r: any) => (r.matchers || []).some((m: any) => m.type === 'all'));
      entry.catch_all_rule = catchAll
        ? { id: catchAll.id, enabled: catchAll.enabled !== false, actions: catchAll.actions }
        : null;
    }
    out.cloudflare.push(entry);
  };
  const worker = async () => {
    while (cursor < zoneDomains.length && cursor < CHECK_LIMIT) {
      const d = zoneDomains[cursor++];
      await checkOne(d);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, CHECK_LIMIT) }, worker));
  out.cloudflare.sort((a: any, b: any) => (a.domain || '').localeCompare(b.domain || ''));

  // 4. Which worker scripts exist in the account (does dheetantra-social-crm exist?)
  try {
    const accountId = await c.env.SECRETS_KV.get('CLOUDFLARE_ACCOUNT_ID');
    if (accountId) {
      const scripts: any[] = await cfFetch(c.env, `/accounts/${accountId}/workers/scripts?per_page=50`) || [];
      out.workers = scripts.map((s: any) => ({ name: s.id, modified_on: s.modified_on }));
    } else {
      out.workers = [];
    }
  } catch (e: any) {
    out.workers = [];
    out.workers_error = e.message;
  }

  // 5. Have any emails actually landed in this workspace inbox?
  try {
    const counts: any = await c.env.DB.prepare(
      "SELECT COUNT(*) AS convs FROM conversations WHERE workspace_id = ? AND platform = 'email'"
    ).bind(workspaceId).first();
    out.inbox_email_conversations = counts?.convs || 0;
  } catch {
    out.inbox_email_conversations = 0;
  }

  return c.json(out);
});

// ==========================================
// EMAIL INBOX (received emails)
// ==========================================

// List email conversations with latest message preview
router.get('/api/email/inbox/conversations', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10) || 50, 200);
  const offset = Math.max(parseInt(c.req.query('offset') || '0', 10) || 0, 0);

  try {
    const { results } = await c.env.DB.prepare(
      `SELECT
         c.id, c.status, c.updated_at, c.customer_last_message_at,
         ct.id AS contact_id, ct.name AS contact_name, ct.platform_contact_id AS sender_email,
         m.id AS last_message_id, m.content AS preview, m.created_at AS last_message_at, m.media_url
       FROM conversations c
       JOIN contacts ct ON c.contact_id = ct.id
       LEFT JOIN messages m ON m.id = (
         SELECT id FROM messages WHERE conversation_id = c.id ORDER BY rowid DESC LIMIT 1
       )
       WHERE c.workspace_id = ? AND c.platform = 'email'
       ORDER BY COALESCE(m.created_at, c.updated_at) DESC, m.rowid DESC
       LIMIT ? OFFSET ?`
    ).bind(workspaceId, limit, offset).all();

    const conversations = (results || []).map((row: any) => {
      const media = parseEmailMediaJson(row.media_url);
      return {
        ...row,
        subject: media.subject || '',
        has_attachments: (media.attachments?.length || 0) > 0,
        unverified: !!media.unverified,
      };
    });

    return c.json({ conversations });
  } catch (e: any) {
    console.error('[Email Inbox] Failed to list conversations:', e);
    return c.json({ error: e.message || 'Failed to load inbox' }, 500);
  }
});

// Get one email conversation thread (messages + contact info)
router.get('/api/email/inbox/conversations/:id', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const conversationId = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  try {
    const conversation: any = await c.env.DB.prepare(
      `SELECT c.*, ct.id AS contact_id, ct.name AS contact_name, ct.platform_contact_id AS sender_email, ct.email AS contact_email
       FROM conversations c
       JOIN contacts ct ON c.contact_id = ct.id
       WHERE c.id = ? AND c.workspace_id = ? AND c.platform = 'email'`
    ).bind(conversationId, workspaceId).first();

    if (!conversation) return c.json({ error: 'Conversation not found' }, 404);

    const { results } = await c.env.DB.prepare(
      `SELECT m.* FROM messages m
       WHERE m.conversation_id = ?
       ORDER BY m.rowid ASC`
    ).bind(conversationId).all();

    const messages = (results || []).map((m: any) => {
      const media = parseEmailMediaJson(m.media_url);
      return { ...m, media, subject: media.subject || '' };
    });

    // Best mailbox to reply from = the original recipient "to" address stored in first incoming email
    const firstIncoming = messages.find((m: any) => m.sender_type === 'contact' && m.media?.to);
    let replyMailbox = firstIncoming?.media?.to || '';
    if (!replyMailbox) {
      try {
        const { resolveFromAddress } = await import('../services/emailService');
        const resolved = await resolveFromAddress(c.env, workspaceId, null);
        replyMailbox = resolved.fromEmail;
      } catch { /* fallback */ }
    }

    return c.json({ conversation, messages, replyMailbox });
  } catch (e: any) {
    console.error('[Email Inbox] Failed to load conversation:', e);
    return c.json({ error: e.message || 'Failed to load conversation' }, 500);
  }
});

// Reply to an email conversation (sends via EMAIL_SENDER and stores the reply)
router.post('/api/email/inbox/conversations/:id/reply', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const conversationId = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { html, text } = await c.req.json();
  if (!html && !text) return c.json({ error: 'Reply body is required' }, 400);

  try {
    // 1. Load conversation + contact + verify ownership
    const row: any = await c.env.DB.prepare(
      `SELECT c.id, ct.platform_contact_id AS sender_email
       FROM conversations c
       JOIN contacts ct ON c.contact_id = ct.id
       WHERE c.id = ? AND c.workspace_id = ? AND c.platform = 'email'`
    ).bind(conversationId, workspaceId).first();

    if (!row) return c.json({ error: 'Conversation not found' }, 404);
    const toEmail = row.sender_email;

    // 2. Determine mailbox to send from (original recipient) + original Message-Id
    const firstIncoming: any = await c.env.DB.prepare(
      `SELECT m.media_url FROM messages m
       WHERE m.conversation_id = ? AND m.sender_type = 'contact'
       ORDER BY m.rowid ASC LIMIT 1`
    ).bind(conversationId).first();
    const firstMedia = parseEmailMediaJson(firstIncoming?.media_url);
    let fromEmail = firstMedia.to || '';
    let originalSubject = firstMedia.subject || '';
    const originalMessageId = firstMedia.messageId || '';

    const { resolveFromAddress, sendEmail, logEmailSend } = await import('../services/emailService');

    let resolved: any;
    try {
      resolved = await resolveFromAddress(c.env, workspaceId, fromEmail || null);
    } catch (e: any) {
      return c.json({ error: e.message, code: e.code || 'E_FROM_INVALID' }, e.status || 400);
    }
    fromEmail = resolved.fromEmail;

    const rate = await checkEmailRateLimit(c.env, workspaceId);
    if (!rate.ok) return c.json({ error: rate.error }, 429);

    const quota = await checkEmailPlanQuota(c.env, workspaceId);
    if (!quota.ok) return c.json({ error: quota.error, code: 'E_QUOTA_EXCEEDED' }, 429);

    const abuse = await checkDomainAbuse(c.env, resolved.domain.id, c.executionCtx);
    if (!abuse.ok) return c.json({ error: abuse.message, code: 'E_DOMAIN_SUSPENDED' }, 403);

    const subject = originalSubject.startsWith('Re:') ? originalSubject : `Re: ${originalSubject || 'Your email'}`;
    const inReplyTo = originalMessageId || undefined;
    const references = originalMessageId || undefined;

    try {
      await sendEmail(c.env, { to: toEmail, from: fromEmail, subject, html: html || '', text: text || '', inReplyTo, references });
    } catch (e: any) {
      try { await logEmailSend(c.env, { workspaceId, domainId: resolved.domain.id, fromEmail, toEmail, subject, status: 'failed', errorCode: e.code, errorMessage: e.message }); } catch (logErr) { console.error('[Email] Failed to log reply error:', logErr); }
      return c.json({ success: false, error: e.message || 'Reply failed', code: e.code || 'E_REPLY_FAILED' }, e.status || 500);
    }

    try {
      await logEmailSend(c.env, { workspaceId, domainId: resolved.domain.id, fromEmail, toEmail, subject, status: 'sent' });
      await incrementEmailUsage(c.env, workspaceId, quota.isOverage);
    } catch (bookkeepingErr) { console.error('[Email] Reply bookkeeping failed (email was delivered):', bookkeepingErr); }

    // 3. Store the reply in messages for a complete thread view
    const replyId = crypto.randomUUID();
    const replyNow = new Date().toISOString();
    const replyContent = text || stripHtmlTags(html || '');
    const replyMediaJson = JSON.stringify({ html: html || '', subject, to: toEmail, attachments: [] });
    await c.env.DB.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, content, media_url, status, message_type, platform, created_at)
       VALUES (?, ?, 'agent', ?, ?, 'sent', 'email', 'email', ?)`
    ).bind(
      replyId,
      conversationId,
      replyContent,
      replyMediaJson,
      replyNow
    ).run();

    await c.env.DB.prepare(
      `UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(conversationId).run();

    // Broadcast the reply over the workspace WebSocket (same `new_message`
    // shape as WhatsApp) so other devices see it live, not just the sender's
    // optimistic bubble.
    try {
      const globalDoId = c.env.CHAT_DO.idFromName(`global-${workspaceId}`);
      const stub = c.env.CHAT_DO.get(globalDoId);
      await stub.fetch(new Request('http://do/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'new_message',
          customer_last_message_at: replyNow,
          message: {
            id: replyId,
            conversation_id: conversationId,
            sender_type: 'agent',
            message_type: 'email',
            content: replyContent,
            media_url: replyMediaJson,
            platform: 'email',
            status: 'sent',
            created_at: replyNow,
          },
        }),
      }));
    } catch (doErr) {
      console.error('[Email Reply] Failed to broadcast reply to DO:', doErr);
    }

    return c.json({
      success: true,
      monthlyLimit: quota.monthlyLimit,
      remaining: Math.max(0, quota.remaining - 1),
      overage: quota.isOverage,
      data: {
        id: replyId,
        status: 'sent',
        created_at: replyNow,
      },
    });
  } catch (e: any) {
    console.error('[Email Inbox] Reply failed:', e);
    return c.json({ success: false, error: e.message || 'Reply failed', code: e.code || 'E_REPLY_FAILED' }, e.status || 500);
  }
});


// Create/Update Email Template
router.post('/api/email-templates', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { templateType, subject, bodyHtml } = await c.req.json();
  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    `INSERT INTO email_templates (id, workspace_id, template_type, subject, body_html) 
     VALUES (?, ?, ?, ?, ?) 
     ON CONFLICT(workspace_id, template_type) 
     DO UPDATE SET subject = excluded.subject, body_html = excluded.body_html, updated_at = CURRENT_TIMESTAMP`
  ).bind(id, workspaceId, templateType, subject, bodyHtml).run();

  return c.json({ success: true, template_type: templateType });
});

// Fetch Email Templates
router.get('/api/email-templates', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { limit, offset } = pagination(c, 100);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM email_templates WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).bind(workspaceId, limit, offset).all();

  return c.json({ templates: results });
});

// ==========================================
// 7. WHATSAPP API INTEGRATION
// ==========================================

// Save WhatsApp Config

export default router;
