import { EmailMessage } from 'cloudflare:email';
import {
  addEmailRoutingDns,
  createCatchAllRule,
  createZone,
  deleteZone,
  enableEmailRouting,
  findZone,
  getCloudflareCredentials,
  getZone,
  listRoutingRules,
  listZoneDnsRecords,
  resetCatchAllRule,
} from './cloudflareApi';

export class EmailServiceError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 500, code = 'E_INTERNAL') {
    super(message);
    this.name = 'EmailServiceError';
    this.status = status;
    this.code = code;
  }
}

export function validateEmailAddress(email: string): boolean {
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email);
}

// MIME headers must never contain CR/LF (header injection protection)
export function sanitizeHeaderValue(value: string): string {
  return String(value || '').replace(/[\r\n]/g, ' ').trim();
}

// Attachment types that are safe to serve inline; everything else is forced
// to application/octet-stream so attacker-controlled MIME types (e.g. text/html
// or image/svg+xml) can never render as content on the dashboard origin.
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'text/plain', 'text/csv', 'application/json',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'audio/mpeg', 'audio/ogg', 'video/mp4',
]);

export function sanitizeAttachmentType(type: string): string {
  const t = String(type || '').split(';')[0].trim().toLowerCase();
  return ALLOWED_ATTACHMENT_TYPES.has(t) ? t : 'application/octet-stream';
}

export function mapSendErrorCode(code: string, fallbackMessage: string): { status: number; message: string } {
  switch (code) {
    case 'E_SENDER_NOT_VERIFIED':
    case 'E_SENDER_DOMAIN_NOT_AVAILABLE':
      return { status: 400, message: 'Sender domain is not onboarded/verified for sending yet. Complete the DNS setup and verify sending first.' };
    case 'E_RECIPIENT_NOT_ALLOWED':
    case 'E_RECIPIENT_SUPPRESSED':
      return { status: 400, message: 'Recipient is not allowed or is suppressed.' };
    case 'E_RATE_LIMIT_EXCEEDED':
    case 'E_DAILY_LIMIT_EXCEEDED':
      return { status: 429, message: 'Email sending rate limit exceeded. Try again later.' };
    case 'E_CONTENT_TOO_LARGE':
      return { status: 400, message: 'Email content too large (max 5 MiB).' };
    case 'E_TOO_MANY_RECIPIENTS':
      return { status: 400, message: 'Too many recipients (max 50).' };
    case 'E_TOO_MANY_ATTACHMENTS':
      return { status: 400, message: 'Too many attachments (max 32).' };
    case 'E_DELIVERY_FAILED':
      return { status: 502, message: 'Email delivery failed at the receiving server.' };
    default:
      return { status: 500, message: fallbackMessage || 'Email sending failed.' };
  }
}

// ==========================================
// SENDING
// ==========================================

export interface SendEmailInput {
  to: string;
  from: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  inReplyTo?: string;   // original Message-Id for threading
  references?: string;  // thread references for threading
}

export async function sendEmail(env: any, input: SendEmailInput): Promise<{ messageId: string }> {
  const binding = env.EMAIL_SENDER;
  if (!binding || typeof binding.send !== 'function') {
    throw new EmailServiceError('EMAIL_SENDER binding is not configured', 500, 'E_BINDING_MISSING');
  }

  // Preferred: structured send() API
  try {
    const res = await binding.send({
      to: input.to,
      from: input.from,
      subject: input.subject,
      html: input.html || undefined,
      text: input.text || undefined,
      replyTo: input.replyTo || undefined,
    });
    return { messageId: res?.messageId || '' };
  } catch (err: any) {
    const code = err?.code || '';
    const msg = err?.message || String(err);

    // Fallback to the legacy raw-MIME API when the structured payload shape
    // was rejected. The legacy `[[send_email]]` binding does not accept the
    // structured payload and rejects with an uncoded error (e.g. TypeError),
    // so treat missing code as shape rejection too. Errors that carry a
    // Cloudflare code happened after acceptance and must NOT be retried,
    // otherwise the email could be delivered twice.
    if (!code || code === 'E_VALIDATION_ERROR') {
      try {
        const raw = buildRawMime(input);
        const message = new EmailMessage(input.from, input.to, raw);
        await binding.send(message);
        return { messageId: '' };
      } catch (legacyErr: any) {
        const mapped = mapSendErrorCode(legacyErr?.code || '', legacyErr?.message || String(legacyErr));
        throw new EmailServiceError(mapped.message, mapped.status, legacyErr?.code || 'E_INTERNAL');
      }
    }

    const mapped = mapSendErrorCode(code, msg);
    throw new EmailServiceError(mapped.message, mapped.status, code);
  }
}

export function buildRawMime(input: SendEmailInput): string {
  const boundary = `dheetantra-${crypto.randomUUID().replace(/-/g, '')}`;
  const from = sanitizeHeaderValue(input.from);
  const to = sanitizeHeaderValue(input.to);
  const subject = sanitizeHeaderValue(input.subject);
  const replyTo = input.replyTo ? sanitizeHeaderValue(input.replyTo) : '';
  const inReplyTo = input.inReplyTo ? sanitizeHeaderValue(input.inReplyTo) : '';
  const references = input.references ? sanitizeHeaderValue(input.references) : '';
  const parts: string[] = [];
  parts.push(`From: ${from}`);
  parts.push(`To: ${to}`);
  parts.push(`Subject: ${subject}`);
  if (replyTo) parts.push(`Reply-To: ${replyTo}`);
  if (inReplyTo) parts.push(`In-Reply-To: ${inReplyTo}`);
  if (references) parts.push(`References: ${references}`);
  parts.push('MIME-Version: 1.0');
  parts.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  parts.push('');
  parts.push(`--${boundary}`);
  parts.push('Content-Type: text/plain; charset=UTF-8');
  parts.push('Content-Transfer-Encoding: 8bit');
  parts.push('');
  parts.push(input.text || stripHtml(input.html || ''));
  parts.push(`--${boundary}`);
  parts.push('Content-Type: text/html; charset=UTF-8');
  parts.push('Content-Transfer-Encoding: 8bit');
  parts.push('');
  parts.push(input.html || `<html><body>${escapeHtml(input.text || '')}</body></html>`);
  parts.push(`--${boundary}--`);
  return parts.join('\r\n');
}

export function stripHtml(html: string): string {
  return (html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function escapeHtml(text: string): string {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderTemplate(text: string, vars: Record<string, string> = {}): string {
  return (text || '').replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key) => {
    return key in vars && vars[key] !== undefined ? String(vars[key]) : match;
  });
}

export async function logEmailSend(
  env: any,
  entry: {
    workspaceId: string;
    domainId?: string;
    fromEmail: string;
    toEmail: string;
    subject?: string;
    status: 'sent' | 'failed';
    errorCode?: string;
    errorMessage?: string;
    messageId?: string;
  }
) {
  try {
    await env.DB.prepare(
      `INSERT INTO email_send_logs (id, workspace_id, domain_id, from_email, to_email, subject, status, error_code, error_message, message_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      entry.workspaceId,
      entry.domainId || null,
      entry.fromEmail,
      entry.toEmail,
      entry.subject || null,
      entry.status,
      entry.errorCode || null,
      entry.errorMessage || null,
      entry.messageId || null
    ).run();
  } catch (e) {
    console.error('Failed to write email send log:', e);
  }
}

export async function resolveFromAddress(env: any, workspaceId: string, fromAddress?: string | null) {
  if (fromAddress) {
    const normalized = fromAddress.trim().toLowerCase();
    if (!validateEmailAddress(normalized)) {
      throw new EmailServiceError('Invalid from address', 400, 'E_VALIDATION');
    }
    const domainPart = normalized.split('@')[1];
    if (!domainPart) throw new EmailServiceError('Invalid from address', 400, 'E_VALIDATION');
    const domainRow: any = await env.DB.prepare(
      'SELECT * FROM domains WHERE workspace_id = ? AND domain_name = ?'
    ).bind(workspaceId, domainPart).first();
    if (!domainRow || domainRow.status !== 'active' || domainRow.review_status !== 'approved') {
      if (domainRow?.status === 'suspended') {
        throw new EmailServiceError('This domain has been suspended due to high send failures. Contact support to restore it.', 403, 'E_DOMAIN_SUSPENDED');
      }
      throw new EmailServiceError('From domain is not an active domain of this workspace', 400, 'E_FROM_DOMAIN_INVALID');
    }
    const mailbox: any = await env.DB.prepare('SELECT * FROM domain_emails WHERE domain_id = ? AND email_address = ? COLLATE NOCASE')
      .bind(domainRow.id, normalized).first();
    if (!mailbox) {
      throw new EmailServiceError('From address is not a registered mailbox of this workspace', 400, 'E_FROM_MAILBOX_INVALID');
    }
    return { domain: domainRow, mailbox, fromEmail: normalized };
  }

  // No from given: use the default mailbox of the first active domain
  const domainRow: any = await env.DB.prepare(
    "SELECT * FROM domains WHERE workspace_id = ? AND status = 'active' AND review_status = 'approved' ORDER BY created_at ASC LIMIT 1"
  ).bind(workspaceId).first();
  if (!domainRow) throw new EmailServiceError('No active domain configured. Add and verify a domain first.', 400, 'E_NO_ACTIVE_DOMAIN');

  const mailbox: any = await env.DB.prepare('SELECT * FROM domain_emails WHERE domain_id = ? ORDER BY is_default DESC, created_at ASC LIMIT 1')
    .bind(domainRow.id).first();
  if (!mailbox) {
    throw new EmailServiceError('No mailbox configured for this domain. Create a mailbox first.', 400, 'E_NO_MAILBOX');
  }
  return { domain: domainRow, mailbox, fromEmail: mailbox.email_address };
}

// ==========================================
// DOMAIN ONBOARDING (Cloudflare zone + Email Routing)
// ==========================================

const DEFAULT_WORKER_NAME = 'dheetantra-social-crm';

// Cloudflare returns these errors when the target state already exists
// (Email Routing already enabled, DNS record already present, catch-all rule
// already created). Onboarding re-runs frequently (approve + verify + cron),
// so these must be treated as success, not failure.
// 81044 = Email Routing already enabled; 81051/81057 = routing DNS records
// already present; 1004/1042/1040 = zone/account-level "already exists".
// NOTE: 10300 ("email routing not enabled" on other calls) and 81058 ("records
// cannot be created") are NOT "already configured" — tolerating them would
// silently skip setup and mark the domain active while email does not work.
const ALREADY_CF_CODES = new Set(['81044', '81051', '81057', '1004', '1042', '1040']);
function isAlreadyConfiguredError(e: any): boolean {
  if (!e) return false;
  if ((e.errors || []).some((er: any) => ALREADY_CF_CODES.has(String(er?.code ?? '')))) return true;
  return /already (enabled|exists|created|set up)|already configured|already in use/i.test(String(e?.message || ''));
}

// A catch-all rule only counts as "ours" when it is enabled AND routes to the
// configured worker. Adopting a disabled rule or one targeting another worker
// (different env/tenant) would mark the domain active while email silently
// drops — so those are NOT adoptable.
function isUsableCatchAll(rule: any, workerName: string): boolean {
  if (!rule || rule.enabled === false) return false;
  return (rule.actions || []).some((a: any) => {
    if (a.type !== 'worker') return false;
    const v = a.value;
    // Cloudflare returns the worker value as an array, but some API paths
    // return a plain string — accept both so an existing rule is adopted
    // instead of failing onboarding with "rule already exists".
    return Array.isArray(v) ? v.includes(workerName) : String(v || '') === workerName;
  });
}

// Find an adoptable catch-all rule: must be enabled AND route to the
// configured worker (string or array action value — both API shapes are
// accepted by isUsableCatchAll). Foreign rules (drop/forward actions, or a
// worker belonging to another env/tenant in the shared Cloudflare account)
// are deliberately NOT adoptable: adopting them would mark the domain active
// while email silently drops or leaks to the other worker's operator.
function findCatchAll(rules: any[], workerName: string): any | undefined {
  return (rules || []).find(
    (r: any) => (r.matchers || []).some((m: any) => m.type === 'all') && isUsableCatchAll(r, workerName)
  );
}

export async function onboardDomain(env: any, row: any) {
  const updates: Record<string, any> = { last_checked_at: new Date().toISOString() };

  try {
    // Credentials are immutable within this run: fetch once, pass to every
    // Cloudflare call instead of re-reading KV per call
    const creds = await getCloudflareCredentials(env);
    let zoneId = row.zone_id;

    // 1. Create (or adopt an existing) Cloudflare zone if missing — idempotent
    if (!zoneId) {
      const existing = await findZone(env, row.domain_name, creds);
      let created = existing;
      if (!created) {
        // Concurrent onboarding (approve + verify + cron) can both miss the
        // findZone check and POST /zones. The loser gets "zone already exists"
        // — treat that as a race and adopt the winning zone instead of
        // marking the domain failed.
        try {
          created = await createZone(env, row.domain_name, row.setup_mode === 'cname' ? 'partial' : 'full', creds);
        } catch (zoneErr: any) {
          if (isAlreadyConfiguredError(zoneErr)) {
            const adopted = await findZone(env, row.domain_name, creds);
            if (adopted) {
              created = adopted;
              console.log(`[Email] Adopted concurrently-created zone for ${row.domain_name} zone=${adopted.id}`);
            } else {
              throw zoneErr;
            }
          } else {
            throw zoneErr;
          }
        }
      }
      zoneId = created.id;
      await env.DB.prepare('UPDATE domains SET zone_id = ? WHERE id = ?').bind(zoneId, row.id).run();
      row.zone_id = zoneId;

      if (row.setup_mode === 'cname' && created.verification_key) {
        const verification = [{
          type: 'TXT',
          name: `cloudflare-verify.${row.domain_name}`,
          content: created.verification_key,
          note: 'Domain ownership verification (keep it while domain is active)',
        }];
        updates.verification_records = JSON.stringify(verification);
      }
    }

    const zone = await getZone(env, zoneId, creds);
    if (zone.name_servers && zone.name_servers.length) {
      updates.nameservers = JSON.stringify(zone.name_servers);
    }

    if (zone.status === 'active') {
      // 2. Enable Email Routing + DNS records + catch-all rule.
      // Only mark the domain active when routing is fully set up; otherwise
      // keep it 'failed' so checkDomain retries the routing steps.
      let routingReady = true;
      try {
        // Idempotent: onboarding runs repeatedly (admin approve + "जांचें" +
        // maintenance cron). Cloudflare returns "already enabled/exists"
        // errors when the state is already correct — those are NOT failures.
        await enableEmailRouting(env, zoneId, creds).catch((e: any) => {
          if (isAlreadyConfiguredError(e)) {
            console.log(`[Email] Email Routing already enabled for ${row.domain_name}; continuing`);
            return;
          }
          throw e;
        });
        await addEmailRoutingDns(env, zoneId, creds).catch((e: any) => {
          if (isAlreadyConfiguredError(e)) {
            console.log(`[Email] Routing DNS already present for ${row.domain_name}; continuing`);
            return;
          }
          console.error('[Email] routing dns step failed (may already exist):', e.message);
        });

        let ruleId = row.routing_rule_id;
        if (!ruleId) {
          const workerName = env.WORKER_NAME || DEFAULT_WORKER_NAME;
          const rules = await listRoutingRules(env, zoneId, creds);
          const existing = findCatchAll(rules, workerName);
          if (existing) {
            ruleId = existing.id;
          } else {
            try {
              const rule = await createCatchAllRule(env, zoneId, workerName, creds);
              ruleId = rule.id;
              console.log(`[Email] Catch-all rule created for ${row.domain_name} -> worker "${workerName}" rule=${ruleId}`);
            } catch (ruleErr: any) {
              // Concurrent runner created the rule between list and create:
              // re-list and adopt instead of failing the whole onboarding.
              if (isAlreadyConfiguredError(ruleErr)) {
                const rulesAfter = await listRoutingRules(env, zoneId, creds);
                const adopted = findCatchAll(rulesAfter, workerName);
                if (adopted) {
                  ruleId = adopted.id;
                  console.log(`[Email] Adopted concurrent catch-all rule for ${row.domain_name} rule=${ruleId}`);
                } else {
                  throw ruleErr;
                }
              } else {
                throw ruleErr;
              }
            }
          }
        }
        updates.routing_rule_id = ruleId;
      } catch (e: any) {
        routingReady = false;
        console.error('[Email] Email routing setup failed for', row.domain_name, e);
        updates.error_message = `Email routing setup failed: ${e.message || 'unknown error'}`;
      }

      if (routingReady) {
        // 3. Capture DNS records for the UI
        try {
          const records = await listZoneDnsRecords(env, zoneId, creds);
          const mx = records.filter((r: any) => r.type === 'MX').map((r: any) => ({ name: r.name, content: r.content, priority: r.priority }));
          const spf = records.filter((r: any) => r.type === 'TXT' && r.content.includes('v=spf1')).map((r: any) => ({ name: r.name, content: r.content }));
          const dkim = records.filter((r: any) => r.type === 'TXT' && r.name.toLowerCase().includes('_domainkey')).map((r: any) => ({ name: r.name, content: r.content }));
          const dmarc = records.filter((r: any) => r.type === 'TXT' && r.name.toLowerCase().startsWith('_dmarc')).map((r: any) => ({ name: r.name, content: r.content }));
          if (mx.length) updates.mx_records = JSON.stringify(mx);
          if (spf.length) updates.spf_record = spf[0]?.content ? JSON.stringify(spf) : updates.spf_record;
          if (dkim.length) updates.dkim_records = JSON.stringify(dkim);
          if (dmarc.length) updates.dmarc_record = JSON.stringify(dmarc);
        } catch (e: any) {
          console.error('[Email] Failed to fetch DNS records for display:', e.message);
        }

        // Fallback: if Cloudflare could not list the zone records (partial/CNAME
        // zones, listing permission missing, etc.), still surface the standard
        // Email Routing records so the user can add them manually at their
        // provider. Without MX, receiving can never work in partial mode.
        // These go into pending_records (NOT the mx/spf columns, which represent
        // records actually present in the zone) so the UI can label them as
        // "add at your provider — not yet active".
        const pendingRecords: any[] = [];
        if (!updates.mx_records) {
          ['route1.mx.cloudflare.net', 'route2.mx.cloudflare.net', 'route3.mx.cloudflare.net']
            .forEach((host, i) => pendingRecords.push({ name: row.domain_name, content: host, priority: i + 10, type: 'MX' }));
        }
        if (!updates.spf_record) {
          pendingRecords.push({ name: row.domain_name, content: 'v=spf1 include:_spf.mx.cloudflare.net ~all', type: 'TXT' });
        }
        updates.pending_records = pendingRecords.length ? JSON.stringify(pendingRecords) : null;
        if (!updates.dkim_records) updates.dkim_records = JSON.stringify([]);
        if (!updates.dmarc_record) updates.dmarc_record = JSON.stringify([]);
      }

      updates.status = routingReady ? 'active' : 'failed';
      if (routingReady) updates.error_message = null;
    } else {
      updates.status = 'pending';
      updates.error_message = null;
    }
  } catch (e: any) {
    updates.status = 'failed';
    updates.error_message = e.message || 'Failed to onboard domain';
    console.error('[Email] Domain onboarding failed for', row.domain_name, e);
  }

  await persistDomainUpdates(env, row.id, updates);
  return { ...row, ...updates };
}

export async function checkDomain(env: any, row: any) {
  // Abuse-suspended domains must be restored by an admin; a plain DNS re-check
  // must never silently lift the suspension.
  if (row.status === 'suspended') {
    return { ...row, status: 'suspended' };
  }
  if (!row.zone_id) {
    return onboardDomain(env, row);
  }
  try {
    const creds = await getCloudflareCredentials(env);
    const zone = await getZone(env, row.zone_id, creds);

    // Zone deleted/moved/initializing: drop the stale references and re-onboard
    // (findZone will re-adopt the zone if it still exists under this account)
    if (zone.status === 'deleted' || zone.status === 'moved') {
      await env.DB.prepare('UPDATE domains SET zone_id = NULL, routing_rule_id = NULL WHERE id = ?').bind(row.id).run();
      return onboardDomain(env, { ...row, zone_id: null, routing_rule_id: null });
    }

    if (zone.status === 'active') {
      // Re-run onboarding whenever the domain is not fully onboarded
      // (includes repairing a 'failed' domain or a missing catch-all rule)
      if (row.status !== 'active' || !row.routing_rule_id) {
        return onboardDomain(env, row);
      }
      // Catch-all rule deleted externally: detect and repair
      try {
        const rules = await listRoutingRules(env, row.zone_id, creds);
        const hasCatchAll = (rules || []).some((r: any) => (r.matchers || []).some((m: any) => m.type === 'all'));
        if (!hasCatchAll) {
          return onboardDomain(env, row);
        }
      } catch (e: any) {
        console.error('[Email] Failed to list routing rules during check:', e.message);
      }
    }

    const updates: Record<string, any> = { last_checked_at: new Date().toISOString(), error_message: null };
    if (zone.status !== 'active') updates.status = 'pending';
    await persistDomainUpdates(env, row.id, updates);
    return { ...row, ...updates };
  } catch (e: any) {
    // Only clear the zone references when the zone is REALLY gone (404 /
    // "not found"). Transient failures (429 rate-limit, 5xx, token errors)
    // must keep zone_id: wiping it forces findZone+createZone on every retry,
    // which races/duplicates zones and keeps the domain stuck in pending.
    const status = e?.status || 0;
    const msg = e?.message || String(e);
    // Operator-precedence safe: only 404 (or a genuine 400 not-found) wipes
    // zone references. A bare message regex on ANY status would let transient
    // 429/5xx errors (whose text happens to contain "not found") wipe zone_id
    // and force destructive findZone/createZone re-runs.
    const gone = status === 404 || (status === 400 && /not found|does not exist|deleted/i.test(msg));
    if (gone) {
      await env.DB.prepare('UPDATE domains SET zone_id = NULL, routing_rule_id = NULL WHERE id = ?').bind(row.id).run();
      return onboardDomain(env, { ...row, zone_id: null, routing_rule_id: null });
    }
    // Zone still exists but the API call failed (transient): keep the zone,
    // surface the error, and let the next maintenance/verify retry it.
    const transientUpdates: Record<string, any> = {
      last_checked_at: new Date().toISOString(),
      error_message: `Cloudflare check failed (${status || 'network'}): ${msg}`,
    };
    await persistDomainUpdates(env, row.id, transientUpdates);
    console.error('[Email] Transient zone check failure for', row.domain_name, status, msg);
    return { ...row, ...transientUpdates };
  }
}

// A Cloudflare error means the resource is already gone only when it is a
// 404 (or a genuine 400 "not found"). 403/429/5xx/network must NOT be treated
// as gone — they are real failures.
function isGoneError(e: any): boolean {
  const status = Number(e?.status || 0);
  const msg = String(e?.message || '');
  return status === 404 || (status === 400 && /not found|does not exist|deleted|no longer/i.test(msg));
}

export async function removeDomain(env: any, row: any) {
  const warnings: string[] = [];
  const zoneFailures: any[] = [];
  let creds: any = null;
  try {
    creds = await getCloudflareCredentials(env);
  } catch (e: any) {
    console.error('[Email] removeDomain: failed to read Cloudflare credentials:', e?.message || e);
  }

  if (!creds?.token) {
    if (row.zone_id) {
      // Cannot verify or clean up the live zone — deleting the row now would
      // orphan a zone that keeps routing inbound mail (silent drop) and let
      // another workspace re-adopt it later.
      zoneFailures.push({ status: 403, message: 'Cloudflare credentials missing — the zone stays in Cloudflare' });
    } else {
      warnings.push('Cloudflare credentials missing (no zone to clean up)');
    }
  } else {
    // Zone FIRST: deleting the routing rule before the zone delete succeeds
    // would tear down email routing for a domain whose delete fails and is
    // kept for retry — the domain must stay fully functional. A rule orphaned
    // inside an already-deleted zone is harmless, so zone-first is strictly
    // safer. The rule is cleaned up only once the zone is confirmed gone
    // (deleted or already-gone 404).
    if (row.zone_id) {
      try {
        await deleteZone(env, row.zone_id, creds);
      } catch (e: any) {
        if (isGoneError(e)) {
          console.log(`[Email] Zone ${row.zone_id} already gone for ${row.domain_name}; ignoring`);
        } else {
          zoneFailures.push(e);
        }
      }
    }
    if (row.routing_rule_id && row.zone_id && !zoneFailures.length) {
      try {
        // Rules created by this app are always catch-alls. Catch-all is a
        // zone singleton that cannot be removed via DELETE /rules/{id}; the
        // supported teardown is resetting it to a disabled drop rule.
        await resetCatchAllRule(env, row.zone_id, creds);
      } catch (e: any) {
        if (isGoneError(e)) {
          console.log(`[Email] Catch-all already gone for ${row.domain_name}; ignoring`);
        } else {
          warnings.push(`rule: ${e.message}`);
        }
      }
    }
  }

  // Keep the DB row whenever the zone could not be confirmed gone. A live
  // zone that keeps routing inbound mail must never be orphaned: deleting the
  // row would silently drop the domain's incoming mail and let another
  // workspace re-adopt the zone and catch-all. Transient failures
  // (network/rate-limit/5xx) keep the row for automatic maintenance retry;
  // permanent ones (403/400, missing credentials) keep it until the user
  // removes the zone in Cloudflare and retries the delete — the zone is then
  // 404 and the delete succeeds.
  if (row.zone_id && zoneFailures.length) {
    await persistDomainUpdates(env, row.id, {
      error_message: `Delete pending: ${zoneFailures.map((e) => e.message).join('; ')}`,
    });
    return { deleted: false, errors: zoneFailures.map((e) => `zone: ${e.message}`) };
  }
  await env.DB.prepare('DELETE FROM domains WHERE id = ?').bind(row.id).run();
  return { deleted: true, errors: warnings };
}

async function persistDomainUpdates(env: any, domainId: string, updates: Record<string, any>) {
  const allowed = ['zone_id', 'nameservers', 'verification_records', 'mx_records', 'spf_record', 'dkim_records', 'dmarc_record', 'pending_records', 'routing_rule_id', 'status', 'error_message', 'last_checked_at', 'consecutive_failures', 'next_retry_at'];
  const keys = Object.keys(updates).filter(k => allowed.includes(k));
  if (!keys.length) return;
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => updates[k] === undefined ? null : updates[k]);
  await env.DB.prepare(`UPDATE domains SET ${setClause} WHERE id = ?`).bind(...values, domainId).run();
}

// ==========================================
// SCHEDULED MAINTENANCE (cron trigger)
// ==========================================

// Called by the worker's scheduled() handler. Re-checks domains that are
// approved but not fully receiving-ready (nameserver activation pending or a
// transient Cloudflare failure left them stuck in pending/failed) and repairs
// them. Bounded per run (row count AND retry backoff) so the scheduled handler
// stays well within its wall budget: a row blocked by next_retry_at is skipped,
// and consecutive failures back off 1m -> 2m -> 4m ... capped at 60m so
// permanently broken domains stop hammering the Cloudflare API.
export async function runDomainMaintenance(env: any, ctx: any) {
  const startedAt = new Date().toISOString();
  // Timestamp marker: lets the diagnostics endpoint prove whether the cron
  // trigger actually fires (a common reason domains stay stuck in pending).
  try {
    await env.SECRETS_KV?.put('EMAIL_MAINTENANCE_LAST_RUN', startedAt);
  } catch (e) {
    console.error('[Email] Failed to write maintenance marker:', e);
  }
  try {
    const { results } = await env.DB.prepare(
      `SELECT * FROM domains
       WHERE review_status = 'approved' AND (status IN ('pending', 'failed') OR routing_rule_id IS NULL)
         AND (next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP)
       ORDER BY last_checked_at ASC
       LIMIT 3`
    ).all();
    for (const row of results || []) {
      try {
        const updated: any = await checkDomain(env, row);
        if (updated?.status === 'active') {
          await env.DB.prepare(
            'UPDATE domains SET consecutive_failures = 0, next_retry_at = NULL WHERE id = ?'
          ).bind(row.id).run();
        } else {
          // A 'pending' result with no error means the Cloudflare zone is
          // still initializing / awaiting nameserver activation — a normal
          // state that depends on the user's DNS action, NOT a hard failure.
          // Start fast (2 min) so a zone flips to active quickly once
          // Cloudflare verifies it, but ESCALATE (2->5->10->20->40->60) so a
          // zone that never activates stops monopolizing the per-run quota
          // instead of being polled on every cron tick forever. Real errors
          // keep the exponential backoff (1m -> 2m -> 4m ... capped at 60m).
          const isPendingZone = updated?.status === 'pending' && !updated?.error_message;
          const failures = (Number(row.consecutive_failures) || 0) + 1;
          const pendingWindows = [2, 5, 10, 20, 40, 60];
          const backoffMin = isPendingZone
            ? pendingWindows[Math.min(failures - 1, pendingWindows.length - 1)]
            : Math.min(Math.pow(2, failures - 1), 60);
          await env.DB.prepare(
            `UPDATE domains SET consecutive_failures = ?, next_retry_at = datetime('now', ?) WHERE id = ?`
          ).bind(failures, `+${backoffMin} minutes`, row.id).run();
          console.log(`[Email] Maintenance: ${row.domain_name} not ready (${updated?.status}${isPendingZone ? ', zone activating' : ''}, retry in ${backoffMin}m)`);
        }
      } catch (e: any) {
        console.error(`[Email] Maintenance check failed for ${row.domain_name}:`, e.message);
      }
    }
    if (results && results.length) {
      console.log(`[Email] Maintenance checked ${results.length} domain(s)`);
    }
  } catch (e: any) {
    console.error('[Email] Maintenance run error:', e);
  }
}

// ==========================================
// INCOMING EMAIL HANDLER (email routing -> worker)
// ==========================================

export async function handleIncomingEmail(message: any, env: any, ctx: any) {
  const started = Date.now();
  try {
    const recipient = parseRecipient(message.to);
    if (!recipient) return;

    const domainRow: any = await env.DB.prepare(
      'SELECT * FROM domains WHERE domain_name = ?'
    ).bind(recipient.domain).first();
    if (!domainRow) {
      console.log(`[Email] No domain registered for ${recipient.domain}; dropping`);
      return;
    }
    // Abuse-suspended and admin-rejected domains must stay that way: a delivered
    // email must never silently lift the suspension or override admin review.
    // NOTE: admin rejection is stored as review_status='rejected' with
    // status='failed' (never status='rejected'), so both fields are checked.
    if (domainRow.status === 'suspended' || domainRow.status === 'rejected' || domainRow.review_status === 'rejected') {
      console.log(`[Email] Domain ${recipient.domain} is suspended/rejected (status=${domainRow.status}, review=${domainRow.review_status}); dropping`);
      return;
    }
    // Domains still in admin review are never auto-approved by receiving mail.
    if (domainRow.review_status !== 'approved') {
      console.log(`[Email] Domain ${recipient.domain} not yet approved (review=${domainRow.review_status}); dropping`);
      return;
    }
    // If mail physically reached this Worker, Cloudflare Email Routing is live
    // for the domain. Some domains were onboarded outside the DB flow (manual
    // dashboard setup) or predate the zone columns, so an already-approved row
    // may not be marked active yet. Self-heal it and process instead of dropping.
    if (domainRow.status !== 'active' || !domainRow.zone_id) {
      console.log(`[Email] Self-healing domain ${recipient.domain}: status=${domainRow.status} zone=${domainRow.zone_id ? 'set' : 'null'} -> active`);
      await env.DB.prepare(
        "UPDATE domains SET status = 'active', error_message = NULL, last_checked_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(domainRow.id).run();
      domainRow.status = 'active';
    }

    const mailbox: any = await env.DB.prepare('SELECT * FROM domain_emails WHERE email_address = ? COLLATE NOCASE')
      .bind(recipient.full).first()
      || await env.DB.prepare('SELECT * FROM domain_emails WHERE domain_id = ? AND is_default = 1 LIMIT 1').bind(domainRow.id).first();

    const rawText = await readRaw(message);
    const parsed = await parseEmailMessage(message, rawText);
    const senderEmail = (parsed.fromAddress || String(message.from || '')).toLowerCase().trim();
    if (!senderEmail || senderEmail === 'postmaster@' + recipient.domain) return;

    // Best-effort sender verification: flag messages whose SPF/DKIM
    // authentication headers explicitly report failure (e.g. forged From).
    // Only explicit fail/softfail markers are used, so legitimate mail is
    // never mislabeled. The flag is surfaced in the inbox UI.
    const topHeaders = splitHeadersBody(rawText).headers;
    const authResults = `${topHeaders.get('authentication-results') || ''} ${topHeaders.get('received-spf') || ''}`;
    const senderUnverified = /(spf|dkim)[\s=:]*\b(fail|softfail)\b/i.test(authResults);

    const workspaceId = domainRow.workspace_id;

    // Best-effort inbound throttle: per sender domain, per minute (KV is
    // eventually consistent, so this is defense-in-depth, not a hard cap)
    if (env.SECRETS_KV) {
      const senderDomain = senderEmail.split('@')[1] || 'unknown';
      const inKey = `EMAIL_IN:${domainRow.id}:${senderDomain}:${Math.floor(Date.now() / 60000)}`;
      const inCount = parseInt(await env.SECRETS_KV.get(inKey) || '0', 10);
      if (inCount >= 30) {
        console.log(`[Email] Dropping email from ${senderEmail}: inbound rate cap exceeded`);
        return;
      }
      await env.SECRETS_KV.put(inKey, String(inCount + 1), { expirationTtl: 120 });
    }

    // Contact
    let contact: any = await env.DB.prepare(
      "SELECT * FROM contacts WHERE workspace_id = ? AND platform = 'email' AND platform_contact_id = ?"
    ).bind(workspaceId, senderEmail).first();
    if (!contact) {
      const contactId = crypto.randomUUID();
      await env.DB.prepare(
        "INSERT INTO contacts (id, workspace_id, platform, platform_contact_id, name, email) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(contactId, workspaceId, 'email', senderEmail, parsed.fromName || senderEmail, senderEmail).run();
      contact = { id: contactId };
    }

    // Conversation
    let conversation: any = await env.DB.prepare(
      "SELECT id FROM conversations WHERE workspace_id = ? AND contact_id = ? AND platform = 'email' AND status = 'open' ORDER BY created_at DESC LIMIT 1"
    ).bind(workspaceId, contact.id).first();
    if (!conversation) {
      const conversationId = crypto.randomUUID();
      await env.DB.prepare(
        "INSERT INTO conversations (id, workspace_id, contact_id, platform, status, customer_last_message_at) VALUES (?, ?, ?, ?, 'open', CURRENT_TIMESTAMP)"
      ).bind(conversationId, workspaceId, contact.id, 'email').run();
      conversation = { id: conversationId };
    } else {
      // Also bump updated_at so an email into an existing conversation pushes
      // it back to the top of the inbox (sorted by updated_at DESC).
      await env.DB.prepare('UPDATE conversations SET customer_last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(conversation.id).run();
    }

    // Attachments -> R2 (parallel uploads; content types whitelisted, forced
    // to download-only so attacker-controlled MIME can never render inline)
    const attachments: any[] = [];
    await Promise.all((parsed.attachments || []).map(async (att) => {
      try {
        if (!att.data || att.data.byteLength === 0) return;
        const safeName = (att.filename || 'file').replace(/[^\w.\-]+/g, '_');
        const key = `email/${crypto.randomUUID()}-${safeName}`;
        await env.MEDIA_BUCKET.put(key, att.data, {
          httpMetadata: {
            contentType: sanitizeAttachmentType(att.type || ''),
            contentDisposition: 'attachment',
          },
        });
        attachments.push({ name: safeName, type: sanitizeAttachmentType(att.type || ''), url: `/api/public/media/${key}` });
      } catch (e) {
        console.error('[Email] Attachment storage failed:', e);
      }
    }));

    const mediaJson = JSON.stringify({
      html: parsed.html || '',
      subject: parsed.subject || '',
      attachments,
      to: recipient.full,
      unverified: senderUnverified,
    });

    const messageId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, content, media_url, status, message_type, platform, created_at)
       VALUES (?, ?, 'contact', ?, ?, 'delivered', 'email', 'email', CURRENT_TIMESTAMP)`
    ).bind(messageId, conversation.id, parsed.text || parsed.subject || '(no content)', mediaJson).run();

    // Real-time broadcast — same `new_message` shape as WhatsApp so Flutter
    // chat/inbox/notification listeners work identically for email threads.
    const emailInNow = new Date().toISOString();
    try {
      const globalDoId = env.CHAT_DO.idFromName(`global-${workspaceId}`);
      const stub = env.CHAT_DO.get(globalDoId);
      await stub.fetch(new Request('http://internal/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          type: 'new_message',
          customer_last_message_at: emailInNow,
          from: senderEmail,
          contact_name: parsed.fromName || senderEmail,
          message: {
            id: messageId,
            conversation_id: conversation.id,
            sender_type: 'contact',
            message_type: 'email',
            content: parsed.text || parsed.subject || '(no content)',
            media_url: mediaJson,
            platform: 'email',
            status: 'delivered',
            created_at: emailInNow,
          },
        }),
      }));
    } catch (e) {
      console.error('[Email] Broadcast failed:', e);
    }

    // Push notification for workspace members (same fan-out pattern as the
    // WhatsApp webhook: chunked, capped, dead tokens removed).
    try {
      const members: any = await env.DB.prepare(
        'SELECT user_id FROM workspace_members WHERE workspace_id = ?'
      ).bind(workspaceId).all();
      if (members.results && members.results.length > 0) {
        const userIds = (members.results as Array<{ user_id: string }>).map((m) => m.user_id);
        const placeholders = userIds.map(() => '?').join(',');
        const tokens: any = await env.DB.prepare(
          `SELECT token FROM fcm_tokens WHERE user_id IN (${placeholders})`
        ).bind(...userIds).all();
        if (tokens.results && tokens.results.length > 0) {
          const { sendPushNotification } = await import('../../lib/fcm');
          const title = `New email from ${parsed.fromName || senderEmail}`;
          const emailPreview = parsed.text || parsed.subject || '(no content)';
          const bodyPreview = emailPreview.length > 100 ? emailPreview.substring(0, 97) + '...' : emailPreview;
          const CHUNK = 25;
          const MAX_TOTAL_SENDS = 45;
          const targets = (tokens.results as Array<{ token: string }>).slice(-MAX_TOTAL_SENDS);
          for (let start = 0; start < targets.length; start += CHUNK) {
            const chunk = targets.slice(start, start + CHUNK);
            const sends = await Promise.allSettled(
              chunk.map((row) =>
                sendPushNotification(
                env,
                row.token,
                title,
                bodyPreview,
                  {
                    workspaceId,
                    type: 'new_message',
                    from: senderEmail,
                    conversation_id: conversation.id,
                    messageId,
                  }
                )
              )
            );
            for (let i = 0; i < sends.length; i++) {
              const s = sends[i];
              if (s.status === 'fulfilled' && s.value.unregistered) {
                try {
                  await env.DB.prepare('DELETE FROM fcm_tokens WHERE token = ?').bind(chunk[i].token).run();
                } catch (e) {
                  console.error('[Email] Failed to delete unregistered FCM token:', e);
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('[Email] FCM push failed:', e);
    }

    // Forward to configured forward_to (guard against loops)
    const forwardTo = mailbox?.forward_to;
    if (forwardTo) {
      const forwardDomain = String(forwardTo).split('@')[1]?.toLowerCase() || '';
      const isLoop = await env.DB.prepare('SELECT id FROM domains WHERE domain_name = ? AND status = ?').bind(forwardDomain, 'active').first().catch(() => null);
      if (!isLoop) {
        ctx.waitUntil?.(sendForward(env, message, forwardTo, rawText));
      }
    }

    console.log(`[Email] Incoming stored: ${senderEmail} -> ${recipient.full} (${Date.now() - started}ms)`);
  } catch (e) {
    console.error('[Email] Incoming email handler error:', e);
  }
}

async function sendForward(env: any, original: any, forwardTo: string, rawText: string) {
  try {
    const message = new EmailMessage(String(original.from || ''), forwardTo, rawText);
    await env.EMAIL_SENDER.send(message);
  } catch (e) {
    console.error('[Email] Forward failed:', e);
  }
}

function parseRecipient(to: string | undefined): { full: string; local: string; domain: string } | null {
  const raw = String(to || '').trim();
  if (!raw) return null;
  const first = raw.split(',')[0].trim().replace(/^[^<]*<([^>]+)>$/, '$1').toLowerCase();
  const at = first.lastIndexOf('@');
  if (at <= 0 || at === first.length - 1) return null;
  const local = first.slice(0, at);
  const domain = first.slice(at + 1);
  if (!/^[\w.+-]+$/.test(local) || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return null;
  return { full: first, local, domain };
}

// ==========================================
// MINIMAL MIME PARSER (no external deps)
// ==========================================

const MAX_EMAIL_BYTES = 8 * 1024 * 1024; // 8 MiB cap for incoming

async function readRaw(message: any): Promise<string> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = message.raw.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > MAX_EMAIL_BYTES) break;
      chunks.push(value);
    }
  }
  return new TextDecoder('utf-8').decode(concatBytes(chunks));
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  let size = 0;
  for (const c of chunks) size += c.byteLength;
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

interface ParsedEmail {
  subject: string;
  fromAddress: string;
  fromName: string;
  text: string;
  html: string;
  attachments: { filename: string; type: string; data: Uint8Array }[];
  parts: number;
}

export async function parseEmailMessage(message: any, rawText?: string): Promise<ParsedEmail> {
  const raw = rawText ?? await readRaw(message);
  const { headers, body } = splitHeadersBody(raw);

  const subject = decodeHeader(headers.get('subject') || '');
  const from = headers.get('from') || String(message.from || '');
  const { address, name } = parseAddress(from);

  const parsed: ParsedEmail = {
    subject,
    fromAddress: address,
    fromName: name,
    text: '',
    html: '',
    attachments: [],
    parts: 0,
  };

  collectParts(headers.get('content-type') || 'text/plain', body, parsed, 0);
  return parsed;
}

function splitHeadersBody(raw: string): { headers: Map<string, string>; body: string } {
  const sepIndex = raw.indexOf('\r\n\r\n');
  const sep = sepIndex >= 0 ? sepIndex : raw.indexOf('\n\n');
  const headerText = sep >= 0 ? raw.slice(0, sep) : raw;
  const body = sep >= 0 ? raw.slice(sep + (sepIndex >= 0 ? 4 : 2)) : '';

  const headers = new Map<string, string>();
  const unfolded = headerText.replace(/\r?\n[ \t]+/g, ' ');
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const name = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    headers.set(name, value);
  }
  return { headers, body };
}

function parseContentType(value: string): { type: string; params: Record<string, string> } {
  const parts = value.split(';');
  const type = (parts[0] || 'text/plain').trim().toLowerCase();
  const params: Record<string, string> = {};
  for (let i = 1; i < parts.length; i++) {
    const idx = parts[i].indexOf('=');
    if (idx <= 0) continue;
    const key = parts[i].slice(0, idx).trim().toLowerCase();
    let val = parts[i].slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    params[key] = val;
  }
  return { type, params };
}

function collectParts(contentType: string, body: string, out: ParsedEmail, depth: number) {
  if (depth > 10) return;
  const { type, params } = parseContentType(contentType);

  if (type.startsWith('multipart/')) {
    const boundary = params['boundary'];
    // A 1-2 char boundary would explode the split into millions of parts
    // (CPU/memory DoS); RFC 2046 boundaries are at least 8 chars in practice.
    if (!boundary || boundary.length < 8) return;
    const parts = body.split(new RegExp(`--${escapeRegExp(boundary)}`));
    for (const part of parts) {
      if (out.parts >= 100) break; // cap total MIME parts
      out.parts++;
      const trimmed = part.replace(/^[ \t]*\r?\n/, '').replace(/\r?\n[ \t]*$/, '');
      if (!trimmed || trimmed.startsWith('--')) continue;
      const { headers, body: partBody } = splitHeadersBody(trimmed);
      const partType = headers.get('content-type') || 'text/plain';
      const disposition = headers.get('content-disposition') || '';
      const transferEncoding = (headers.get('content-transfer-encoding') || '7bit').toLowerCase().trim();

      if (disposition.toLowerCase().startsWith('attachment') || (parseContentType(partType).type.startsWith('application/'))) {
        if (out.attachments.length >= 32) continue; // cap attachments
        const filename = extractFilename(disposition, partType);
        const data = decodePart(partBody, transferEncoding);
        if (filename || (data && data.byteLength > 0)) {
          out.attachments.push({ filename: filename || 'attachment.bin', type: parseContentType(partType).type, data: data || new Uint8Array(0) });
        }
        continue;
      }

      if (parseContentType(partType).type.startsWith('multipart/')) {
        collectParts(partType, partBody, out, depth + 1);
        continue;
      }

      const text = decodePartText(partBody, transferEncoding);
      const t = parseContentType(partType).type;
      if (t === 'text/plain' && !out.text) out.text = text;
      if (t === 'text/html' && !out.html) out.html = text;
    }
    return;
  }

  const transferEncoding = '7bit';
  if (type === 'text/plain') out.text = decodePartText(body, transferEncoding);
  if (type === 'text/html') out.html = decodePartText(body, transferEncoding);
}

function extractFilename(disposition: string, contentType: string): string {
  const m = disposition.match(/filename\*?=(?:"([^"]+)"|([^;\s]+))/i);
  if (m) return decodeHeader((m[1] || m[2] || '').trim());
  const m2 = contentType.match(/name\*?=(?:"([^"]+)"|([^;\s]+))/i);
  if (m2) return decodeHeader((m2[1] || m2[2] || '').trim());
  return '';
}

function decodePart(body: string, transferEncoding: string): Uint8Array | null {
  try {
    if (transferEncoding === 'base64') {
      const cleaned = body.replace(/\s+/g, '');
      if (!cleaned) return null;
      const bin = atob(cleaned);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    }
    if (transferEncoding === 'quoted-printable') {
      return new TextEncoder().encode(decodeQuotedPrintable(body));
    }
    return new TextEncoder().encode(body);
  } catch (e) {
    console.error('[Email] Part decode failed:', e);
    return null;
  }
}

function decodePartText(body: string, transferEncoding: string): string {
  const bytes = decodePart(body, transferEncoding);
  if (!bytes) return '';
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/\r\n/g, '\n');
}

function decodeQuotedPrintable(text: string): string {
  return text.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/=\r?\n/g, '');
}

function decodeHeader(value: string): string {
  if (!value) return '';
  return value.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_, charset, encoding, encoded) => {
    try {
      if (encoding.toLowerCase() === 'b') {
        const bin = atob(encoded.replace(/\s+/g, ''));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      }
      return decodeQuotedPrintable(encoded);
    } catch {
      return encoded;
    }
  }).replace(/\s+([,;])/g, '$1').trim();
}

function parseAddress(value: string): { address: string; name: string } {
  const cleaned = value.trim();
  const angleMatch = cleaned.match(/<([^>]+)>/);
  const address = (angleMatch ? angleMatch[1] : cleaned.split(/\s+/).pop() || cleaned).trim();
  let name = '';
  if (angleMatch) {
    name = decodeHeader(cleaned.replace(/\s*<[^>]+>\s*$/, '').replace(/^"|"$/g, '').trim());
  }
  return { address: address.replace(/^"|"$/g, ''), name };
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
