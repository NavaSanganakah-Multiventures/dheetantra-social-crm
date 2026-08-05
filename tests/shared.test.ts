import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  pagination,
  parseDomain,
  DOMAIN_REGEX,
  EMAIL_REGEX,
  YEAR_MONTH,
  stripHtmlTags,
  parseEmailMediaJson,
  getWorkspacePlanLimits,
  checkEmailRateLimit,
  checkEmailPlanQuota,
  checkDomainAddRateLimit,
  DEFAULT_PLAN_LIMITS,
} from '../src/shared';

// --- Fake D1 -------------------------------------------------------------
// SQL keys are whitespace-normalized so indentation differences in the test
// file never cause a lookup miss.
const norm = (sql: string) => sql.replace(/\s+/g, ' ').trim();
class FakeD1 {
  results: Map<string, any>;
  calls: string[] = [];
  constructor(results: Record<string, any> = {}) {
    this.results = new Map(Object.entries(results).map(([k, v]) => [norm(k), v]));
  }
  prepare(sql: string) {
    const key = norm(sql);
    this.calls.push(sql);
    const exec = (kind: 'first' | 'all' | 'run') => async (): Promise<any> => {
      if (kind === 'run') return { success: true };
      return kind === 'first' ? this.results.get(key) ?? null : { results: this.results.get(key) ?? [] };
    };
    const bound = {
      first: exec('first'),
      all: exec('all'),
      run: exec('run'),
    };
    return {
      ...bound,
      bind: () => bound,
    };
  }
}
const makeCtx = (query: Record<string, string> = {}) => ({
  req: { query: (k: string) => query[k] ?? null },
});

describe('pagination', () => {
  it('applies defaults when no params are sent', () => {
    const p = pagination(makeCtx());
    expect(p).toEqual({ limit: 200, offset: 0 });
  });

  it('respects provided limit and offset', () => {
    const p = pagination(makeCtx({ limit: '50', offset: '100' }));
    expect(p).toEqual({ limit: 50, offset: 100 });
  });

  it('clamps limit to maxLimit', () => {
    expect(pagination(makeCtx({ limit: '99999' }), 200, 1000).limit).toBe(1000);
  });

  it('falls back to the default limit when limit is 0 or absent', () => {
    expect(pagination(makeCtx({ limit: '0' })).limit).toBe(200);
    expect(pagination(makeCtx({ limit: '-5' })).limit).toBe(1);
  });

  it('uses the provided defaultLimit', () => {
    expect(pagination(makeCtx(), 500, 1000).limit).toBe(500);
  });

  it('never returns negative offset', () => {
    expect(pagination(makeCtx({ offset: '-3' })).offset).toBe(0);
  });
});

describe('domain/email regex', () => {
  it('accepts valid domains', () => {
    for (const d of ['example.com', 'mail.example.co.in', 'a-b.example.org', 'xn--bcher-kva.example']) {
      expect(DOMAIN_REGEX.test(d)).toBe(true);
    }
  });
  it('rejects invalid domains', () => {
    for (const d of ['exa mple.com', '-bad.com', 'bad-.com', 'exa_mple.com', 'a', 'http://example.com', 'exa mple']) {
      expect(DOMAIN_REGEX.test(d)).toBe(false);
    }
  });
  it('accepts valid emails', () => {
    for (const e of ['a@b.com', 'user.name+tag@example.co.in', 'x_y@sub.example.org']) {
      expect(EMAIL_REGEX.test(e)).toBe(true);
    }
  });
  it('rejects invalid emails', () => {
    for (const e of ['not-an-email', 'a@b', '@b.com', 'a b@c.com']) {
      expect(EMAIL_REGEX.test(e)).toBe(false);
    }
  });
});

describe('parseDomain', () => {
  it('parses JSON text columns into arrays', () => {
    const d = parseDomain({
      id: '1',
      nameservers: '["ns1.x.com","ns2.x.com"]',
      verification_records: '["v=spf1"]',
      mx_records: '[{"host":"mx1"}]',
      spf_record: '["spf"]',
      dkim_records: '[{"key":"k"}]',
      dmarc_records: '["dmarc"]',
      pending_records: '["pending1"]',
    });
    expect(d.nameservers).toEqual(['ns1.x.com', 'ns2.x.com']);
    expect(d.pending_records).toEqual(['pending1']);
    expect(d.spf_records).toEqual(['spf']);
  });

  it('falls back to [] for missing JSON fields', () => {
    const d = parseDomain({ id: '1' });
    expect(d.nameservers).toEqual([]);
    expect(d.mx_records).toEqual([]);
  });
});

describe('stripHtmlTags / parseEmailMediaJson', () => {
  it('strips HTML from plain text extraction', () => {
    expect(stripHtmlTags('<p>Hello <b>World</b></p>')).toBe('Hello World');
  });
  it('parses email media JSON payloads', () => {
    const v = parseEmailMediaJson('{"subject":"Hi","html":"<b>x</b>","to":"a@b.com","attachments":[{"type":"image/png"}]}');
    expect(v.subject).toBe('Hi');
    expect(v.attachments?.length).toBe(1);
    expect(v.unverified).toBeUndefined();
  });
  it('returns empty object for null input', () => {
    expect(parseEmailMediaJson(null)).toEqual({});
  });
});

describe('YEAR_MONTH', () => {
  it('returns current year-month in YYYY-MM format', () => {
    const now = new Date();
    const expected = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    expect(YEAR_MONTH()).toBe(expected);
  });
});

describe('getWorkspacePlanLimits', () => {
  it('merges plan limits_json over defaults', async () => {
    const env = { DB: new FakeD1({
      'SELECT COALESCE(p.limits_json, \'{}\') AS limits_json, COALESCE(p.pay_as_you_go_rate, 0) AS pay_as_you_go_rate\n       FROM workspaces w LEFT JOIN plans p ON w.plan_id = p.id WHERE w.id = ?':
        { limits_json: JSON.stringify({ email_monthly_limit: 500, max_domains: 3 }), pay_as_you_go_rate: 0.5 },
    }) };
    const limits = await getWorkspacePlanLimits(env, 'ws1');
    expect(limits.email_monthly_limit).toBe(500);
    expect(limits.max_domains).toBe(3);
    expect(limits.max_mailboxes_per_domain).toBe(DEFAULT_PLAN_LIMITS.max_mailboxes_per_domain);
    expect(limits.pay_as_you_go_rate).toBe(0.5);
  });

  it('returns defaults when no plan row exists', async () => {
    const env = { DB: new FakeD1() };
    const limits = await getWorkspacePlanLimits(env, 'ws-missing');
    expect(limits).toEqual(DEFAULT_PLAN_LIMITS);
  });

  it('returns defaults when DB throws (fail-safe)', async () => {
    const env = { DB: { prepare: () => { throw new Error('db down'); } } };
    const limits = await getWorkspacePlanLimits(env, 'ws1');
    expect(limits).toEqual(DEFAULT_PLAN_LIMITS);
  });
});

describe('checkEmailRateLimit', () => {
  it('allows sends under the 60/min limit', async () => {
    const env = { DB: new FakeD1({}) };
    const r = await checkEmailRateLimit(env, 'ws1');
    expect(r.ok).toBe(true);
  });

  it('rejects when count exceeds 60', async () => {
    const env = { DB: new FakeD1({
      'INSERT INTO email_rate_limits (window_key, workspace_id, count) VALUES (?, ?, 1)\n       ON CONFLICT(window_key) DO UPDATE SET count = count + 1\n       RETURNING count': { count: 61 },
    }) };
    const r = await checkEmailRateLimit(env, 'ws1');
        expect(r.ok).toBe(false);
    expect(r.error).toContain('Rate limit');
  });

  it('fails open when the limiter errors', async () => {
    const env = { DB: { prepare: () => { throw new Error('db down'); } } };
    const r = await checkEmailRateLimit(env, 'ws1');
    expect(r.ok).toBe(true);
  });
});

describe('checkEmailPlanQuota', () => {
  it('returns remaining quota when under limit', async () => {
    const env = { DB: new FakeD1({
      'SELECT COALESCE(p.limits_json, \'{}\') AS limits_json, COALESCE(p.pay_as_you_go_rate, 0) AS pay_as_you_go_rate\n       FROM workspaces w LEFT JOIN plans p ON w.plan_id = p.id WHERE w.id = ?':
        { limits_json: JSON.stringify({ email_monthly_limit: 100 }), pay_as_you_go_rate: 0 },
      'SELECT emails_sent, overage_emails FROM workspace_email_usage WHERE workspace_id = ? AND year_month = ?':
        { emails_sent: 40, overage_emails: 0 },
    }) };
    const r = await checkEmailPlanQuota(env, 'ws1');
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(60);
    expect(r.isOverage).toBe(false);
  });

  it('blocks when limit reached and no pay-as-you-go', async () => {
    const env = { DB: new FakeD1({
      'SELECT COALESCE(p.limits_json, \'{}\') AS limits_json, COALESCE(p.pay_as_you_go_rate, 0) AS pay_as_you_go_rate\n       FROM workspaces w LEFT JOIN plans p ON w.plan_id = p.id WHERE w.id = ?':
        { limits_json: JSON.stringify({ email_monthly_limit: 100 }), pay_as_you_go_rate: 0 },
      'SELECT emails_sent, overage_emails FROM workspace_email_usage WHERE workspace_id = ? AND year_month = ?':
        { emails_sent: 100, overage_emails: 0 },
    }) };
    const r = await checkEmailPlanQuota(env, 'ws1');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('limit');
  });

  it('allows overage when pay-as-you-go is enabled', async () => {
    const env = { DB: new FakeD1({
      'SELECT COALESCE(p.limits_json, \'{}\') AS limits_json, COALESCE(p.pay_as_you_go_rate, 0) AS pay_as_you_go_rate\n       FROM workspaces w LEFT JOIN plans p ON w.plan_id = p.id WHERE w.id = ?':
        { limits_json: JSON.stringify({ email_monthly_limit: 100 }), pay_as_you_go_rate: 0.5 },
      'SELECT emails_sent, overage_emails FROM workspace_email_usage WHERE workspace_id = ? AND year_month = ?':
        { emails_sent: 150, overage_emails: 0 },
    }) };
    const r = await checkEmailPlanQuota(env, 'ws1');
    expect(r.ok).toBe(true);
    expect(r.isOverage).toBe(true);
    expect(r.overageRate).toBe(0.5);
  });

  it('blocks when email sending is disabled on the plan', async () => {
    const env = { DB: new FakeD1({
      'SELECT COALESCE(p.limits_json, \'{}\') AS limits_json, COALESCE(p.pay_as_you_go_rate, 0) AS pay_as_you_go_rate\n       FROM workspaces w LEFT JOIN plans p ON w.plan_id = p.id WHERE w.id = ?':
        { limits_json: JSON.stringify({ allow_email_send: false }), pay_as_you_go_rate: 0 },
    }) };
    const r = await checkEmailPlanQuota(env, 'ws1');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('not enabled');
  });
});

describe('checkDomainAddRateLimit', () => {
  it('allows up to 5 domains per day', async () => {
    const env = { DB: new FakeD1({}) };
    const r = await checkDomainAddRateLimit(env, 'ws1');
    expect(r.ok).toBe(true);
  });

  it('rejects when count exceeds 5', async () => {
    const env = { DB: new FakeD1({
      'INSERT INTO domain_add_rate_limits (window_key, workspace_id, count) VALUES (?, ?, 1)\n       ON CONFLICT(window_key) DO UPDATE SET count = count + 1\n       RETURNING count': { count: 6 },
    }) };
    const r = await checkDomainAddRateLimit(env, 'ws1');
    expect(r.ok).toBe(false);
  });
});



