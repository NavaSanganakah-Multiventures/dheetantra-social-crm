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

const router = new Hono<{ Bindings: Env; Variables: { user: any; workspaceRole?: string } }>();

// ==========================================
// SUBSCRIBE â create a Razorpay order or
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
      error: 'à¤à¤ªà¤à¥ workspace à¤ªà¤° à¤ªà¤¹à¤²à¥ à¤¸à¥ à¤à¤ active subscription à¤¹à¥à¥¤ à¤ªà¤¹à¤²à¥ à¤à¤¸à¥ cancel à¤à¤°à¥à¤ à¤¯à¤¾ dashboard à¤®à¥à¤ à¤¦à¥à¤à¥à¤à¥¤',
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
  if (plan.billing_type === 'recurring' && !plan.razorpay_plan_id) {
    console.error('[Billing] Recurring plan has no razorpay_plan_id after sync:', plan.id);
    return c.json({ error: 'Payment gateway could not set up this plan. Please try again later.' }, 502);
  }

  const keyId = await getRazorpayKeyId(c.env) || '';
  if (!keyId) {
    console.error('[Billing] RAZORPAY_KEY_ID is not configured in SECRETS_KV');
    return c.json({ error: 'Payment gateway is not configured. Please contact support.' }, 503);
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
    console.error('[Billing] Checkout creation failed:', e?.message || e?.name || 'unknown error',
      e instanceof RazorpayApiError ? JSON.stringify(e.details) : '');
    return c.json({ error: e instanceof RazorpayApiError ? e.message : 'Payment setup failed. Please try again.' }, 502);
  }

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
// VERIFY â confirm the checkout payment
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
    console.warn(`[Billing] Verify signature mismatch for subscription ${subscription_id} ` +
      `(recurring=${isRecurring}, payload=${payload}, sig=${razorpay_signature?.slice(0, 12)}...)`);
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
// SUBSCRIPTION STATUS â current plan + sub
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
// PAYMENTS â invoice history
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
// CANCEL â owner can cancel (at period end)
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
// WEBHOOK â Razorpay server events (no auth)
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
  console.log(`[Billing] Webhook ${body.event || 'unknown'} -> processed=${result.processed} duplicate=${result.duplicate}`);
  return c.json({ success: result.processed, duplicate: result.duplicate, event: result.event });
});

// ==========================================
// SERVICE ADDONS (paid optional services, e.g. Email Service Domain)
// ==========================================

router.get('/api/billing/addons/:addonId?', async (c) => {
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);
  const workspaceId = c.req.header('x-workspace-id');
  const addonId = c.req.param('addonId');

  try {
    let addons: any[] = [];
    if (addonId) {
      const row: any = await c.env.DB.prepare('SELECT * FROM service_addons WHERE id = ? AND is_active = 1').bind(addonId).first();
      if (row) addons = [row];
    } else {
      const { results } = await c.env.DB.prepare(
        'SELECT * FROM service_addons WHERE is_active = 1 ORDER BY sort_order ASC'
      ).all();
      addons = results || [];
    }

    // If a workspace is known, attach its active subscription status for each addon
    let activeSubs: any[] = [];
    if (workspaceId) {
      const now = Math.floor(Date.now() / 1000);
      const { results } = await c.env.DB.prepare(
        `SELECT * FROM addon_subscriptions
         WHERE workspace_id = ? AND status = 'active' AND (current_period_end IS NULL OR current_period_end > ?)`
      ).bind(workspaceId, now).all();
      activeSubs = results || [];
    }

    return c.json({
      addons: addons.map((a: any) => ({
        ...a,
        active_subscription: activeSubs.find((s: any) => s.addon_id === a.id) || null,
      })),
    });
  } catch (e: any) {
    console.error('[Billing] Failed to fetch addons:', e);
    return c.json({ error: e.message || 'Failed to load addons' }, 500);
  }
});

router.post('/api/billing/addons/:addonId/subscribe', async (c) => {
  const user = c.get('user') as any;
  const workspaceId = c.req.header('x-workspace-id');
  const addonId = c.req.param('addonId');

  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);
  if (!user?.id) return c.json({ error: 'Authenticated user required' }, 401);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    // One active email addon at a time per workspace
    if (addonId.startsWith('email-addon')) {
      const existing: any = await c.env.DB.prepare(
        `SELECT * FROM addon_subscriptions
         WHERE workspace_id = ? AND addon_id LIKE 'email-addon-%' AND status IN ('created', 'active')`
      ).bind(workspaceId).first();
      if (existing) {
        return c.json({
          error: 'An email add-on subscription already exists for this workspace. Cancel or let it expire before purchasing a different tier.',
          existing_subscription_id: existing.id,
        }, 400);
      }
    }

    const addon: any = await c.env.DB.prepare('SELECT * FROM service_addons WHERE id = ? AND is_active = 1').bind(addonId).first();
    if (!addon) return c.json({ error: 'Add-on not found' }, 404);

    // Sync a Razorpay plan for recurring addons
    if (addon.billing_type === 'recurring' && addon.upfront_price > 0) {
      const planForSync = {
        id: addon.id,
        name: addon.name,
        description: addon.description || '',
        upfront_price: addon.upfront_price,
        billing_type: addon.billing_type,
        billing_period: addon.billing_period,
        billing_interval: addon.billing_interval,
        currency: addon.currency,
        is_free: 0,
        is_active: 1,
        razorpay_plan_id: addon.razorpay_plan_id || null,
      };
      try {
        addon.razorpay_plan_id = await syncRazorpayPlan(c.env, planForSync);
        if (addon.razorpay_plan_id) {
          await c.env.DB.prepare('UPDATE service_addons SET razorpay_plan_id = ? WHERE id = ?')
            .bind(addon.razorpay_plan_id, addon.id).run();
        }
      } catch (e: any) {
        console.error('[Billing] Addon Razorpay plan sync failed:', e);
      }
      if (!addon.razorpay_plan_id) {
        return c.json({ error: 'Payment gateway temporarily unavailable. Try again later.' }, 502);
      }
    }

    const keyId = await getRazorpayKeyId(c.env);
    if (!keyId) {
      console.error('[Billing] RAZORPAY_KEY_ID missing');
      return c.json({ error: 'Payment gateway not configured. Contact support.' }, 503);
    }

    const subId = crypto.randomUUID();
    try {
      await c.env.DB.prepare(
        `INSERT INTO addon_subscriptions
          (id, workspace_id, addon_id, user_id, billing_type, status, amount, currency, domains_allowed)
         VALUES (?, ?, ?, ?, ?, 'created', ?, ?, ?)`
      ).bind(subId, workspaceId, addon.id, user.id, addon.billing_type || 'recurring',
        addon.upfront_price || 0, addon.currency || 'INR', addon.max_domains || 1).run();
    } catch (insErr: any) {
      // Unique partial index idx_addon_sub_active_email enforces one active email add-on per workspace.
      if (/UNIQUE constraint/i.test(insErr.message)) {
        return c.json({
          error: 'An email add-on subscription already exists for this workspace. Please refresh and try again.',
          code: 'E_ADDON_EXISTS',
        }, 409);
      }
      throw insErr;
    }

    let checkout: any = {};
    if (addon.billing_type === 'recurring' && addon.upfront_price > 0) {
      const rSub = await createRazorpaySubscription(c.env, addon, {
        workspace_id: workspaceId,
        addon_id: addon.id,
        dheetantra_addon_subscription_id: subId,
      });
      await c.env.DB.prepare(
        'UPDATE addon_subscriptions SET razorpay_subscription_id = ? WHERE id = ?'
      ).bind(rSub.id, subId).run();
      checkout = { subscription_id: rSub.id };
    } else {
      // One-time (or zero-price) addon path
      const order = await createRazorpayOrder(c.env, addon, subId);
      await c.env.DB.prepare(
        'UPDATE addon_subscriptions SET razorpay_order_id = ? WHERE id = ?'
      ).bind(order.id, subId).run();
      checkout = { order_id: order.id, amount: razorpayAmount(addon.upfront_price) };
    }

    return c.json({
      success: true,
      key_id: keyId,
      db_subscription_id: subId,
      name: addon.name,
      description: addon.description || '',
      currency: addon.currency || 'INR',
      ...checkout,
      prefill: { email: user.email || '', name: user.name || '' },
    });
  } catch (e: any) {
    console.error('[Billing] Addon subscribe failed:', e);
    if (e instanceof RazorpayConfigError) return c.json({ error: e.message }, 503);
    return c.json({ error: e instanceof RazorpayApiError ? e.message : 'Failed to set up add-on checkout.' }, 502);
  }
});

router.post('/api/billing/addons/:addonId/verify', async (c) => {
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

  const sub: any = await c.env.DB.prepare(
    'SELECT * FROM addon_subscriptions WHERE id = ?'
  ).bind(subscription_id).first();
  if (!sub) return c.json({ error: 'Add-on subscription not found' }, 404);
  if (sub.user_id && sub.user_id !== user.id) return c.json({ error: 'Forbidden' }, 403);

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
    console.warn('[Billing] Addon verify signature mismatch', payload);
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
      console.error('[Billing] Failed to fetch Razorpay addon subscription for verification:', e);
    }
  } else {
    const addon: any = await c.env.DB.prepare('SELECT * FROM service_addons WHERE id = ?').bind(sub.addon_id).first();
    const recurring = addon?.billing_period || 'monthly';
    const interval = Number(addon?.billing_interval) || 1;
    const map: Record<string, number> = { daily: 1, weekly: 7, monthly: 30, yearly: 365 };
    periodEnd = now + (map[recurring] || 30) * interval * 86400;
  }

  try {
    await c.env.DB.prepare(
      `UPDATE addon_subscriptions
       SET status = ?, current_period_start = ?, current_period_end = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(status, periodStart, periodEnd, subscription_id).run();

    await c.env.DB.prepare(
      'INSERT INTO payments (id, workspace_id, subscription_id, razorpay_payment_id, razorpay_order_id, razorpay_subscription_id, amount, currency, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      crypto.randomUUID(),
      sub.workspace_id,
      subscription_id,
      razorpay_payment_id,
      razorpay_order_id || null,
      razorpay_subscription_id || null,
      sub.amount,
      sub.currency || 'INR',
      'captured'
    ).run();
  } catch (dbErr: any) {
    console.error('[Billing] Addon verify DB write failed:', dbErr);
    return c.json({ error: 'Payment verified but failed to persist. Please contact support with this payment id.', razorpay_payment_id, code: 'E_VERIFY_PERSIST' }, 500);
  }

  return c.json({ success: true, addon_id: sub.addon_id, status, current_period_end: periodEnd });
});

export default router;
