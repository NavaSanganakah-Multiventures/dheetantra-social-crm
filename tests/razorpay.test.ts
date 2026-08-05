import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { razorpayAmount, formatAmount, verifyPaymentSignature, verifyWebhookSignature } from '../src/services/razorpay';
import { periodDays, handleRazorpayWebhook, expireSubscriptions } from '../src/services/subscriptionService';

// --- Fake D1 -------------------------------------------------------------
// SQL keys are whitespace-normalized. Idempotency INSERTs (webhook_events)
// are deduped per razorpay_event_id (the 2nd bind arg), emulating
// ON CONFLICT ... DO NOTHING RETURNING. Other statements use an execution
// counter so the first call "succeeds" and repeats can be controlled.
const norm = (sql: string) => sql.replace(/\s+/g, ' ').trim();
class FakeD1 {
  results: Map<string, any>;
  counters: Map<string, number> = new Map();
  seenIdem: Set<string> = new Set();
  calls: string[] = [];
  constructor(results: Record<string, any> = {}) {
    this.results = new Map(Object.entries(results).map(([k, v]) => [norm(k), v]));
  }
  prepare(sql: string) {
    const key = norm(sql);
    this.calls.push(sql);
    const make = (args: any[]) => {
      const exec = (kind: 'first' | 'all' | 'run') => async (): Promise<any> => {
        if (kind === 'run') {
          const c = this.counters.get(key) || 0;
          this.counters.set(key, c + 1);
          return { success: true, meta: { changes: 1 } };
        }
        if (kind === 'first') {
          if (key.includes('webhook_events')) {
            const idemKey = String(args?.[1] ?? '');
            const seenKey = key + '|' + idemKey;
            if (this.seenIdem.has(seenKey)) return null;
            this.seenIdem.add(seenKey);
            const result = this.results.get(key);
            return typeof result === 'function' ? result(0) : result ?? null;
          }
          const c = this.counters.get(key) || 0;
          this.counters.set(key, c + 1);
          const result = this.results.get(key);
          if (typeof result === 'function') return result(c);
          return result ?? null;
        }
        return { results: this.results.get(key) ?? [] };
      };
      const bound = {
        first: exec('first'),
        all: exec('all'),
        run: exec('run'),
      };
      return {
        ...bound,
        bind: (...bindArgs: any[]) => make(bindArgs),
      };
    };
    return make([]);
  }
}

describe('razorpayAmount', () => {
  it('converts rupees to paise', () => {
    expect(razorpayAmount(99)).toBe(9900);
    expect(razorpayAmount(499.5)).toBe(49950);
    expect(razorpayAmount(0.02)).toBe(2);
  });

  it('rounds half-up and never goes negative', () => {
    expect(razorpayAmount(12.345)).toBe(1235);
    expect(razorpayAmount(-5)).toBe(0);
    expect(razorpayAmount(NaN)).toBe(0);
  });
});

describe('formatAmount', () => {
  it('uses the plan currency symbol', () => {
    expect(formatAmount(99, 'INR')).toBe('₹99');
    expect(formatAmount(99, 'USD')).toBe('$99');
    expect(formatAmount(99, 'UNKNOWN')).toBe('₹99');
  });
});

describe('signature verification', () => {
  const secret = 'rzp_test_secret_key_1234567890';

  it('accepts a valid payment signature (order|payment)', async () => {
    const payload = 'order_E123|pay_E456';
    const sig = createHmac('sha256', secret).update(payload).digest('hex');
    expect(await verifyPaymentSignature(secret, payload, sig)).toBe(true);
  });

  it('accepts a valid payment signature (payment|subscription)', async () => {
    const payload = 'pay_E456|sub_E789';
    const sig = createHmac('sha256', secret).update(payload).digest('hex');
    expect(await verifyPaymentSignature(secret, payload, sig)).toBe(true);
  });

  it('rejects a tampered signature', async () => {
    const payload = 'order_E123|pay_E456';
    const sig = createHmac('sha256', secret).update(payload).digest('hex');
    expect(await verifyPaymentSignature(secret, payload, 'deadbeef' + sig.slice(8))).toBe(false);
  });

  it('rejects missing inputs', async () => {
    expect(await verifyPaymentSignature(secret, '', 'abc')).toBe(false);
    expect(await verifyPaymentSignature(secret, 'a|b', '')).toBe(false);
  });

  it('verifies webhook raw-body signatures', async () => {
    const raw = '{"event":"subscription.charged","payload":{}}';
    const sig = createHmac('sha256', secret).update(raw).digest('hex');
    expect(await verifyWebhookSignature(secret, raw, sig)).toBe(true);
    expect(await verifyWebhookSignature(secret, raw + ' ', sig)).toBe(false);
  });
});

describe('periodDays', () => {
  it('maps billing periods to access windows', () => {
    expect(periodDays('monthly', 1)).toBe(30);
    expect(periodDays('monthly', 3)).toBe(90);
    expect(periodDays('yearly', 1)).toBe(365);
    expect(periodDays('weekly', 2)).toBe(14);
    expect(periodDays('daily', 1)).toBe(1);
    expect(periodDays('unknown', 1)).toBe(30);
    expect(periodDays('monthly', 0)).toBe(30);
  });
});

const makeEnv = (db: FakeD1) => ({ DB: db, SECRETS_KV: null, MEDIA_BUCKET: null, CHAT_DO: null });

describe('webhook idempotency', () => {
  const webhookBody = (event: string, subId: string) => ({
    event,
    payload: {
      subscription: {
        entity: {
          id: subId,
          status: 'active',
          current_start: 1750000000,
          current_end: 1752592000,
          plan_id: 'rzp_plan_1',
        },
      },
    },
  });

  it('processes a subscription.charged once and drops duplicates', async () => {
    const db = new FakeD1({
      'SELECT id, workspace_id, plan_id FROM subscriptions WHERE razorpay_subscription_id = ?': { id: 'sub_db_1', workspace_id: 'ws_1', plan_id: 'plan_pro' },
      // First idempotency insert returns an id; repeats return null
      'INSERT INTO webhook_events (id, razorpay_event_id, event_type, payload_json, processed, received_at) VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP) ON CONFLICT(razorpay_event_id) DO NOTHING RETURNING id': (c: number) => (c === 0 ? { id: 'evt_1' } : null),
    });
    const env = makeEnv(db);

    const first = await handleRazorpayWebhook(env, webhookBody('subscription.charged', 'sub_rzp_1'));
    expect(first.processed).toBe(true);
    expect(first.duplicate).toBe(false);

    const second = await handleRazorpayWebhook(env, webhookBody('subscription.charged', 'sub_rzp_1'));
    expect(second.processed).toBe(true);
    expect(second.duplicate).toBe(true);
  });

  it('processes every renewal cycle (payment-bound idempotency key)', async () => {
    const db = new FakeD1({
      'SELECT id, workspace_id, plan_id FROM subscriptions WHERE razorpay_subscription_id = ?': { id: 'sub_db_1', workspace_id: 'ws_1', plan_id: 'plan_pro' },
      'INSERT INTO webhook_events (id, razorpay_event_id, event_type, payload_json, processed, received_at) VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP) ON CONFLICT(razorpay_event_id) DO NOTHING RETURNING id': (c: number) => (c === 0 ? { id: 'evt_1' } : null),
    });
    const env = makeEnv(db);
    const charged = (paymentId: string) => ({
      event: 'subscription.charged',
      payload: {
        subscription: { entity: { id: 'sub_rzp_1', status: 'active', current_start: 1750000000, current_end: 1752592000, plan_id: 'rzp_plan_1' } },
        payment: { entity: { id: paymentId, order_id: 'order_1', amount: 9900, currency: 'INR', status: 'captured', method: 'card' } },
      },
    });

    // Two different renewal payments must both be processed (different idempotency keys)
    const first = await handleRazorpayWebhook(env, charged('pay_cycle_1'));
    const second = await handleRazorpayWebhook(env, charged('pay_cycle_2'));
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(false);

    // But the same payment delivered twice is dropped
    const replay = await handleRazorpayWebhook(env, charged('pay_cycle_1'));
    expect(replay.duplicate).toBe(true);
  });

  it('activates a one-time subscription when payment.captured arrives without verify', async () => {
    const db = new FakeD1({
      'SELECT id, workspace_id, plan_id, billing_type, status FROM subscriptions WHERE razorpay_order_id = ?': { id: 'sub_ot_1', workspace_id: 'ws_1', plan_id: 'plan_pro', billing_type: 'one_time', status: 'created' },
      'SELECT billing_period, billing_interval FROM plans WHERE id = ?': { billing_period: 'monthly', billing_interval: 1 },
      'SELECT workspace_id, plan_id FROM subscriptions WHERE id = ?': { workspace_id: 'ws_1', plan_id: 'plan_pro' },
      'INSERT INTO webhook_events (id, razorpay_event_id, event_type, payload_json, processed, received_at) VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP) ON CONFLICT(razorpay_event_id) DO NOTHING RETURNING id': (c: number) => (c === 0 ? { id: 'evt_1' } : null),
    });
    const env = makeEnv(db);

    const result = await handleRazorpayWebhook(env, {
      event: 'payment.captured',
      payload: {
        payment: { entity: { id: 'pay_ot_1', order_id: 'order_ot_1', amount: 990000, currency: 'INR', status: 'captured', method: 'upi' } },
      },
    });
    expect(result.processed).toBe(true);
    const calls = db.calls.join('\n');
    expect(calls).toContain('UPDATE subscriptions SET');
    expect(calls).toContain('UPDATE workspaces SET plan_id');
  });

  it('downgrades the workspace on subscription.cancelled', async () => {
    const db = new FakeD1({
      'SELECT id, workspace_id, plan_id FROM subscriptions WHERE razorpay_subscription_id = ?': { id: 'sub_db_1', workspace_id: 'ws_1', plan_id: 'plan_pro' },
      'SELECT id FROM plans WHERE is_free = 1 LIMIT 1': { id: 'plan_free' },
      'INSERT INTO webhook_events (id, razorpay_event_id, event_type, payload_json, processed, received_at) VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP) ON CONFLICT(razorpay_event_id) DO NOTHING RETURNING id': { id: 'evt_2' },
    });
    const env = makeEnv(db);

    const result = await handleRazorpayWebhook(env, webhookBody('subscription.cancelled', 'sub_rzp_2'));
    expect(result.processed).toBe(true);
    const downgraded = db.calls.some((sql: string) => /UPDATE workspaces SET plan_id = \? WHERE id = \?/.test(sql.replace(/\s+/g, ' ').trim()));
    expect(downgraded).toBe(true);
  });

  it('rejects unknown events without side effects', async () => {
    const db = new FakeD1({});
    const result = await handleRazorpayWebhook(makeEnv(db), { event: 'payment.authorized', payload: {} });
    expect(result.processed).toBe(false);
  });
});

describe('expireSubscriptions', () => {
  const scanSql = "SELECT s.id, s.workspace_id FROM subscriptions s WHERE s.current_period_end IS NOT NULL AND s.current_period_end < ? AND ((s.status = 'active' AND (s.billing_type = 'one_time' OR s.cancel_at_period_end = 1)) OR s.status = 'completed') LIMIT 500";

  it('expires overdue subscriptions and downgrades their workspaces', async () => {
    const db = new FakeD1({
      [scanSql]: [
        { id: 'sub_1', workspace_id: 'ws_1' }, { id: 'sub_2', workspace_id: 'ws_2' },
      ],
      'SELECT id FROM plans WHERE is_free = 1 LIMIT 1': { id: 'plan_free' },
    });
    const expired = await expireSubscriptions(makeEnv(db));
    expect(expired).toBe(2);
    const calls = db.calls.join('\n');
    expect(calls).toContain("status = 'expired'");
    expect(calls).toContain('UPDATE workspaces SET plan_id');
  });

  it('returns 0 when nothing is due', async () => {
    const db = new FakeD1({ [scanSql]: [] });
    expect(await expireSubscriptions(makeEnv(db))).toBe(0);
  });
});
