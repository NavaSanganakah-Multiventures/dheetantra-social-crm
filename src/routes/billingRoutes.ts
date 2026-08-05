import { Hono } from 'hono';
import { Env } from '../types';
import {
  getRazorpayCredentials,
  getRazorpayKeyId,
  syncRazorpayPlan,
  createRazorpayOrder,
  createRazorpaySubscription,
  fetchRazorpaySubscription,
  cancelRazorpaySubscription,
  verifyPaymentSignature,
  verifyWebhookSignature,
  razorpayAmount,
  RazorpayConfigError,
  RazorpayApiError,
} from '../services/razorpay';
import {
  getWorkspaceSubscription,
  getWorkspacePlan,
  activateSubscription,
  recordPayment,
  downgradeWorkspaceToFree,
  handleRazorpayWebhook,
  periodDays,
} from '../services/subscriptionService';

const router = new Hono<{ Bindings: Env }>();

// ==========================================
// SUBSCRIBE — create a Razorpay order or
// subscription for the chosen plan
// ==========================================

router.post('/api/billing/subscribe', async (c) => {
  const user = c.get('user') as any;
  const workspaceId = c.req.header('x-workspace-id');
  const { plan_id } = await c.req.json();

  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);
  if (!plan_id) return c.json({ error: 'Plan ID required' }, 400);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  const plan: any = await c.env.DB.prepare('SELECT * FROM plans WHERE id = ?').bind(plan_id).first();
  if (!plan) return c.json({ error: 'Plan not found' }, 404);
  if (plan.is_active === 0) return c.json({ error: 'This plan is not currently available.' }, 400);

  const existing = await getWorkspaceSubscription(c.env, workspaceId);
  if (existing) {
    return c.json({
      error: 'आपके workspace पर पहले से एक active subscription है। पहले उसे cancel करें या dashboard में देखें।',
      cancelExisting: true,
      existing: { subscription_id: existing.id, status: existing.status },
    }, 400);
  }

  // Free (or zero-price) plans activate instantly without payment. No
  // subscription row is created so the workspace can upgrade to a paid
  // plan later without being blocked by a dangling "active" record.
  if (plan.is_free === 1 || !Number(plan.upfront_price)) {
    await c.env.DB.prepare('UPDATE workspaces SET plan_id = ? WHERE id = ?').bind(plan.id, workspaceId).run();
    return c.json({ success: true, free: true, plan_id: plan.id });
  }

  // Recurring plans need a Razorpay plan entity
  if (plan.billing_type === 'recurring' && !plan.razorpay_plan_id) {
    try {
      plan.razorpay_plan_id = await syncRazorpayPlan(c.env, plan);
      if (plan.razorpay_plan_id) {
        await c.env.DB.prepare('UPDATE plans SET razorpay_plan_id = ? WHERE id = ?')
          .bind(plan.razorpay_plan_id, plan.id).run();
      }
    } catch (e: any) {
      console.error('[Billing] Razorpay plan sync failed:', e);
      return c.json({ error: e instanceof RazorpayConfigError ? e.message : 'Payment gateway temporarily unavailable. Try again later.' }, e instanceof RazorpayConfigError ? 503 : 502);
    }
  }

  const subId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO subscriptions (id, workspace_id, plan_id, user_id, billing_type, status, amount, currency, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'created', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  ).bind(subId, workspaceId, plan.id, user.id, plan.billing_type || 'recurring',
    Number(plan.upfront_price) || 0, plan.currency || 'INR').run();

  let checkout: any = {};
  try {
    if (plan.billing_type === 'recurring') {
      const rSub = await createRazorpaySubscription(c.env, plan, {
        workspace_id: workspaceId,
        plan_id: plan.id,
        dheetantra_subscription_id: subId,
      });
      await c.env.DB.prepare(
        'UPDATE subscriptions SET razorpay_subscription_id = ?, razorpay_plan_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(rSub.id, plan.razorpay_plan_id, subId).run();
      checkout = { subscription_id: rSub.id };
    } else {
      const order = await createRazorpayOrder(c.env, plan, subId);
      await c.env.DB.prepare(
        'UPDATE subscriptions SET razorpay_order_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(order.id, subId).run();
      checkout = { order_id: order.id, amount: razorpayAmount(plan.upfront_price) };
    }
  } catch (e: any) {
    // Cleanup the dangling row so the user can retry
    try { await c.env.DB.prepare('DELETE FROM subscriptions WHERE id = ?').bind(subId).run(); } catch { /* ignore */ }
    if (e instanceof RazorpayConfigError) {
      return c.json({ error: e.message }, 503);
    }
    console.error('[Billing] Checkout creation failed:', e);
    return c.json({ error: e instanceof RazorpayApiError ? e.message : 'Payment setup failed. Please try again.' }, 502);
  }

  const keyId = await getRazorpayKeyId(c.env) || '';
  return c.json({
    success: true,
    key_id: keyId,
    db_subscription_id: subId,
    name: plan.name,
    description: plan.description || '',
    currency: plan.currency || 'INR',
    ...checkout,
    prefill: { email: user.email || '', name: user.name || '' },
  });
});

// ==========================================
// VERIFY — confirm the checkout payment
// server-side with signature validation
// ==========================================

router.post('/api/billing/verify', async (c) => {
  const user = c.get('user') as any;
  const {
    subscription_id,
    razorpay_payment_id,
    razorpay_subscription_id,
    razorpay_order_id,
    razorpay_signature,
  } = await c.req.json();

  if (!subscription_id || !razorpay_payment_id || !razorpay_signature) {
    return c.json({ error: 'Missing payment details' }, 400);
  }

  const sub: any = await c.env.DB.prepare('SELECT * FROM subscriptions WHERE id = ?').bind(subscription_id).first();
  if (!sub) return c.json({ error: 'Subscription not found' }, 404);
  if (sub.user_id && sub.user_id !== user.id) return c.json({ error: 'Forbidden' }, 403);

  // The payment must be for the exact order/subscription this row was created for
  const isRecurring = sub.billing_type === 'recurring';
  if (isRecurring) {
    if (!razorpay_subscription_id || razorpay_subscription_id !== sub.razorpay_subscription_id) {
      return c.json({ error: 'Payment verification failed. Please contact support.' }, 400);
    }
  } else {
    if (!razorpay_order_id || razorpay_order_id !== sub.razorpay_order_id) {
      return c.json({ error: 'Payment verification failed. Please contact support.' }, 400);
    }
  }

  // Only a pending checkout can be activated; a replayed payment must not
  // reactivate a cancelled/expired/completed row
  if (!['created', 'authenticated'].includes(sub.status)) {
    return c.json({ error: 'Payment verification failed. Please contact support.' }, 400);
  }

  let keySecret = '';
  try {
    const creds = await getRazorpayCredentials(c.env);
    keySecret = creds.keySecret;
  } catch (e: any) {
    return c.json({ error: e.message }, 503);
  }

  const payload = isRecurring
    ? `${razorpay_payment_id}|${razorpay_subscription_id}`
    : `${razorpay_order_id}|${razorpay_payment_id}`;
  const valid = await verifyPaymentSignature(keySecret, payload, razorpay_signature);
  if (!valid) {
    return c.json({ error: 'Payment verification failed. Please contact support.' }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  let periodStart = now;
  let periodEnd: number | null = null;
  let status = 'active';

  if (isRecurring) {
    try {
      const rSub = await fetchRazorpaySubscription(c.env, razorpay_subscription_id);
      if (rSub?.current_start) periodStart = Number(rSub.current_start);
      if (rSub?.current_end) periodEnd = Number(rSub.current_end);
      if (rSub?.status && ['active', 'authenticated'].includes(rSub.status)) status = rSub.status;
    } catch (e) {
      console.error('[Billing] Failed to fetch Razorpay subscription for verification:', e);
      const plan: any = await c.env.DB.prepare('SELECT * FROM plans WHERE id = ?').bind(sub.plan_id).first();
      periodEnd = now + periodDays(plan?.billing_period, plan?.billing_interval) * 86400;
    }
  } else {
    const plan: any = await c.env.DB.prepare('SELECT * FROM plans WHERE id = ?').bind(sub.plan_id).first();
    periodEnd = now + periodDays(plan?.billing_period, plan?.billing_interval) * 86400;
  }

  await activateSubscription(c.env, {
    subscriptionId: sub.id,
    status,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd || undefined,
  });

  await recordPayment(c.env, {
    workspaceId: sub.workspace_id,
    subscriptionId: sub.id,
    razorpayPaymentId: razorpay_payment_id,
    razorpayOrderId: razorpay_order_id || undefined,
    razorpaySubscriptionId: razorpay_subscription_id || undefined,
    amount: sub.amount,
    currency: sub.currency || 'INR',
    status: 'captured',
  });

  return c.json({ success: true, plan_id: sub.plan_id, status });
});

// ==========================================
// SUBSCRIPTION STATUS — current plan + sub
// ==========================================

router.get('/api/billing/subscription', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const subscription = await getWorkspaceSubscription(c.env, workspaceId);
  const plan = await getWorkspacePlan(c.env, workspaceId);

  let features: string[] = [];
  if (plan?.features_json) {
    try { features = JSON.parse(plan.features_json); } catch { features = []; }
  }

  return c.json({
    subscription: subscription ? {
      id: subscription.id,
      plan_id: subscription.plan_id,
      status: subscription.status,
      billing_type: subscription.billing_type,
      amount: subscription.amount,
      currency: subscription.currency,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      cancel_at_period_end: subscription.cancel_at_period_end,
      plan_name: subscription.plan_name,
    } : null,
    plan: plan ? {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      features,
      is_free: plan.is_free,
      is_active: plan.is_active,
    } : null,
  });
});

// ==========================================
// PAYMENTS — invoice history
// ==========================================

router.get('/api/billing/payments', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { results } = await c.env.DB.prepare(
    'SELECT id, razorpay_payment_id, amount, currency, status, method, created_at FROM payments WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 50'
  ).bind(workspaceId).all();
  return c.json({ payments: results });
});

// ==========================================
// CANCEL — owner can cancel (at period end)
// ==========================================

router.post('/api/billing/cancel', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const role = c.get('workspaceRole');
  const { subscription_id } = await c.req.json();

  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);
  if (role !== 'owner') return c.json({ error: 'Forbidden: only workspace owner can cancel the subscription' }, 403);
  if (!subscription_id) return c.json({ error: 'Subscription ID required' }, 400);

  const sub: any = await c.env.DB.prepare('SELECT * FROM subscriptions WHERE id = ?').bind(subscription_id).first();
  if (!sub || sub.workspace_id !== workspaceId) {
    return c.json({ error: 'Subscription not found' }, 404);
  }

  if (sub.status === 'active' && sub.razorpay_subscription_id) {
    try {
      await cancelRazorpaySubscription(c.env, sub.razorpay_subscription_id, true);
    } catch (e: any) {
      console.error('[Billing] Razorpay cancel failed:', e);
      return c.json({ error: e instanceof RazorpayConfigError ? e.message : 'Failed to cancel at Razorpay. Try again.' }, 502);
    }
    await c.env.DB.prepare(
      "UPDATE subscriptions SET cancel_at_period_end = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(sub.id).run();
    return c.json({ success: true, message: 'Subscription cancelled. It will end at the current billing period.' });
  }

  if (['created', 'authenticated', 'paused', 'past_due'].includes(sub.status)) {
    if (sub.razorpay_subscription_id) {
      try { await cancelRazorpaySubscription(c.env, sub.razorpay_subscription_id, false); } catch { /* best effort */ }
    }
    await c.env.DB.prepare(
      "UPDATE subscriptions SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(sub.id).run();
    await downgradeWorkspaceToFree(c.env, workspaceId);
    return c.json({ success: true, message: 'Subscription cancelled.' });
  }

  return c.json({ error: 'No cancellable subscription found.' }, 400);
});

// ==========================================
// WEBHOOK — Razorpay server events (no auth)
// ==========================================

router.post('/api/billing/webhook', async (c) => {
  const raw = await c.req.text();
  const signature = c.req.header('x-razorpay-signature') || '';
  const webhookSecret = c.env.SECRETS_KV ? await c.env.SECRETS_KV.get('RAZORPAY_WEBHOOK_SECRET') : null;
  if (!webhookSecret) {
    console.error('[Billing] RAZORPAY_WEBHOOK_SECRET not configured in KV');
    return c.json({ error: 'Webhook secret not configured' }, 503);
  }
  const valid = await verifyWebhookSignature(webhookSecret, raw, signature);
  if (!valid) {
    console.warn('[Billing] Webhook signature verification failed');
    return c.json({ error: 'Invalid signature' }, 400);
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return c.json({ error: 'Invalid JSON payload' }, 400);
  }

  const result = await handleRazorpayWebhook(c.env, body);
  return c.json({ success: result.processed, duplicate: result.duplicate, event: result.event });
});

export default router;
