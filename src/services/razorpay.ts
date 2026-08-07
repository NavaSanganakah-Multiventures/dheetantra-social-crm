// ==========================================
// Razorpay REST API wrapper (Workers-friendly,
// uses fetch + Web Crypto — no npm SDK needed).
// All amounts are integers in paise.
// ==========================================

export const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1';

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AED: 'د.إ',
  SAR: '﷼',
};

export class RazorpayConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RazorpayConfigError';
  }
}

export class RazorpayApiError extends Error {
  status: number;
  details: any;
  constructor(message: string, status = 500, details?: any) {
    super(message);
    this.name = 'RazorpayApiError';
    this.status = status;
    this.details = details;
  }
}

export async function getRazorpayCredentials(env: any): Promise<{ keyId: string; keySecret: string }> {
  const keyId = env.SECRETS_KV ? await env.SECRETS_KV.get('RAZORPAY_KEY_ID') : null;
  const keySecret = env.SECRETS_KV ? await env.SECRETS_KV.get('RAZORPAY_KEY_SECRET') : null;
  if (!keyId || !keySecret) {
    throw new RazorpayConfigError('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in KV.');
  }
  return { keyId, keySecret };
}

// Non-throwing variant used to expose the public key id to the checkout page
export async function getRazorpayKeyId(env: any): Promise<string | null> {
  return env.SECRETS_KV ? await env.SECRETS_KV.get('RAZORPAY_KEY_ID') : null;
}

export function razorpayAmount(price: number): number {
  return Math.max(0, Math.round((Number(price) || 0) * 100));
}

export function formatAmount(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency || 'INR'] || '₹';
  return `${symbol}${(Number(amount) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

async function razorpayRequest(env: any, path: string, method = 'GET', body?: any): Promise<any> {
  const { keyId, keySecret } = await getRazorpayCredentials(env);
  const auth = btoa(`${keyId}:${keySecret}`);
  const res = await fetch(`${RAZORPAY_API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data: any = null;
  let raw = '';
  try {
    raw = await res.text();
    try { data = JSON.parse(raw); } catch { data = null; }
  } catch (e) {
    raw = '';
  }

  if (!res.ok) {
    const message = data?.error?.description
      || data?.error?.message
      || (raw ? `Razorpay request failed (${res.status}): ${raw.slice(0, 300)}` : `Razorpay request failed (${res.status})`);
    throw new RazorpayApiError(message, res.status, data || raw);
  }
  return data;
}

// ---------------------------------------------------------------------------
// HMAC-SHA256 hex helpers (Web Crypto — available in Workers and Node 18+)
// ---------------------------------------------------------------------------

// CryptoKeys are expensive to import; cache one per secret.
const hmacKeyCache = new Map<string, Promise<CryptoKey>>();

function getHmacKey(secret: string): Promise<CryptoKey> {
  let key = hmacKeyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    hmacKeyCache.set(secret, key);
  }
  return key;
}

export async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await getHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function safeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// Payment verification (v1 signature): used by /api/billing/verify after checkout.
// - Orders (one-time):   payload = `${order_id}|${payment_id}`
// - Subscriptions:       payload = `${payment_id}|${subscription_id}`
export async function verifyPaymentSignature(
  keySecret: string,
  payload: string,
  signature: string
): Promise<boolean> {
  if (!payload || !signature) return false;
  const expected = await hmacSha256Hex(keySecret, payload);
  return safeEqual(expected, signature);
}

// Webhook verification: HMAC-SHA256 of the RAW body with the webhook secret.
export async function verifyWebhookSignature(
  webhookSecret: string,
  rawBody: string,
  signature: string
): Promise<boolean> {
  if (!rawBody || !signature) return false;
  const expected = await hmacSha256Hex(webhookSecret, rawBody);
  return safeEqual(expected, signature);
}

// ---------------------------------------------------------------------------
// Plan / Order / Subscription operations
// ---------------------------------------------------------------------------

// Razorpay plans are immutable for amount/period changes: when the pricing
// details of a plan with an existing razorpay_plan_id change, a new Razorpay
// plan entity is created and its fresh id returned (the caller persists it).
// Existing subscriptions keep running on their original plan — that is
// standard Razorpay behavior. Cosmetic name/description edits PATCH in place.
export async function syncRazorpayPlan(env: any, plan: any): Promise<string | null> {
  if (plan.is_free || !plan.upfront_price || plan.billing_type !== 'recurring') {
    return plan.razorpay_plan_id || null;
  }
  const item = {
    name: String(plan.name).slice(0, 120),
    description: String(plan.description || '').slice(0, 240),
    amount: razorpayAmount(plan.upfront_price),
    currency: plan.currency || 'INR',
  };
  const period = plan.billing_period || 'monthly';
  const interval = Math.max(1, parseInt(plan.billing_interval, 10) || 1);

  if (plan.razorpay_plan_id) {
    let current: any = null;
    try {
      current = await razorpayRequest(env, `/plans/${plan.razorpay_plan_id}`);
    } catch (e) {
      console.error('[Razorpay] Plan fetch failed; recreating plan:', e);
    }
    const pricingChanged = !current
      || Number(current.item?.amount) !== item.amount
      || (current.item?.currency || 'INR') !== item.currency
      || (current.period || 'monthly') !== period
      || (Number(current.interval) || 1) !== interval;
    if (pricingChanged) {
      const created = await razorpayRequest(env, '/plans', 'POST', {
        period,
        interval,
        item,
        notes: { dheetantra_plan_id: plan.id },
      });
      return created?.id || null;
    }
    try {
      await razorpayRequest(env, `/plans/${plan.razorpay_plan_id}`, 'PATCH', {
        item: { name: item.name, description: item.description },
      });
    } catch (e) {
      console.error('[Razorpay] Plan PATCH failed:', e);
    }
    return plan.razorpay_plan_id;
  }
  const created = await razorpayRequest(env, '/plans', 'POST', {
    period,
    interval,
    item,
    notes: { dheetantra_plan_id: plan.id },
  });
  return created?.id || null;
}

export async function createRazorpayOrder(env: any, plan: any, receipt: string): Promise<any> {
  return razorpayRequest(env, '/orders', 'POST', {
    amount: razorpayAmount(plan.upfront_price),
    currency: plan.currency || 'INR',
    receipt: String(receipt).slice(0, 40),
    notes: { dheetantra_plan_id: plan.id, dheetantra_plan_name: plan.name },
  });
}

// Billing cycles that cover the maximum subscription duration Razorpay
// supports (100 years). Used instead of total_count: 0, which Razorpay
// rejects ("The total count must be at least 1"). Cancellation is handled
// by the cancel endpoint, so a 100-year horizon is effectively "billed
// until cancelled".
function cyclesForHorizon(period: string, interval: number): number {
  const i = Math.max(1, Number(interval) || 1);
  switch (period) {
    case 'daily': return Math.max(1, Math.floor((100 * 365) / i));
    case 'weekly': return Math.max(1, Math.floor((100 * 52) / i));
    case 'yearly': return Math.max(1, Math.floor(100 / i));
    case 'monthly':
    default: return Math.max(1, Math.floor((100 * 12) / i));
  }
}

export async function createRazorpaySubscription(env: any, plan: any, notes: Record<string, string>): Promise<any> {
  return razorpayRequest(env, '/subscriptions', 'POST', {
    plan_id: plan.razorpay_plan_id,
    total_count: cyclesForHorizon(plan.billing_period, plan.billing_interval),
    // Razorpay validates this as a strict boolean ("must be true or false");
    // passing the integer 1 is rejected with a 400 on some accounts.
    customer_notify: true,
    notes,
  });
}

export async function fetchRazorpaySubscription(env: any, subscriptionId: string): Promise<any> {
  return razorpayRequest(env, `/subscriptions/${subscriptionId}`);
}

export async function cancelRazorpaySubscription(env: any, subscriptionId: string, atCycleEnd = true): Promise<any> {
  const qs = atCycleEnd ? '?cancel_at_cycle_end=1' : '';
  return razorpayRequest(env, `/subscriptions/${subscriptionId}/cancel${qs}`, 'POST');
}
