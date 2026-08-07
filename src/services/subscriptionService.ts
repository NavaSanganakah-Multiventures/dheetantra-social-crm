// ==========================================
// Subscription lifecycle: activation, expiry
// downgrade and idempotent Razorpay webhook
// processing. Pure DB logic so it can be
// unit-tested with a fake env.
// ==========================================

import { razorpayAmount } from './razorpay';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function getFreePlanId(env: any): Promise<string | null> {
  try {
    const row: any = await env.DB.prepare('SELECT id FROM plans WHERE is_free = 1 LIMIT 1').first();
    return row?.id || null;
  } catch (e) {
    console.error('[Billing] Failed to load free plan:', e);
    return null;
  }
}

// One-time plans get a fixed access window based on the plan's billing period.
export function periodDays(period: string, interval: number): number {
  const i = Math.max(1, Number(interval) || 1);
  switch (period) {
    case 'daily': return i;
    case 'weekly': return 7 * i;
    case 'yearly': return 365 * i;
    case 'monthly':
    default: return 30 * i;
  }
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export async function getWorkspaceSubscription(env: any, workspaceId: string): Promise<any | null> {
  try {
    const sub: any = await env.DB.prepare(
      `SELECT s.*, p.name AS plan_name, p.description AS plan_description, p.features_json AS plan_features_json,
              p.limits_json AS plan_limits_json, p.billing_period AS plan_billing_period, p.billing_interval AS plan_billing_interval
       FROM subscriptions s LEFT JOIN plans p ON p.id = s.plan_id
       WHERE s.workspace_id = ? AND s.status IN ('created', 'authenticated', 'active', 'past_due', 'paused')
       ORDER BY s.created_at DESC LIMIT 1`
    ).bind(workspaceId).first();
    return sub || null;
  } catch (e) {
    console.error('[Billing] Failed to load subscription:', e);
    return null;
  }
}

export async function getWorkspacePlan(env: any, workspaceId: string): Promise<any | null> {
  try {
    const row: any = await env.DB.prepare(
      'SELECT p.* FROM workspaces w LEFT JOIN plans p ON p.id = w.plan_id WHERE w.id = ?'
    ).bind(workspaceId).first();
    return row || null;
  } catch (e) {
    console.error('[Billing] Failed to load workspace plan:', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export async function activateSubscription(
  env: any,
  opts: {
    subscriptionId: string;
    status?: string;
    currentPeriodStart?: number;
    currentPeriodEnd?: number;
  }
): Promise<boolean> {
  try {
    const sets: string[] = ["status = ?", "updated_at = CURRENT_TIMESTAMP"];
    const vals: any[] = [opts.status || 'active'];
    if (opts.currentPeriodStart) { sets.push('current_period_start = ?'); vals.push(opts.currentPeriodStart); }
    if (opts.currentPeriodEnd) { sets.push('current_period_end = ?'); vals.push(opts.currentPeriodEnd); }
    vals.push(opts.subscriptionId);
    await env.DB.prepare(`UPDATE subscriptions SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();

    // Point the workspace at the subscribed plan (unless it is being deactivated)
    if (opts.status === 'active' || opts.status === 'authenticated' || !opts.status) {
      const sub: any = await env.DB.prepare('SELECT workspace_id, plan_id FROM subscriptions WHERE id = ?')
        .bind(opts.subscriptionId).first();
      if (sub?.workspace_id && sub?.plan_id) {
        await env.DB.prepare('UPDATE workspaces SET plan_id = ? WHERE id = ?').bind(sub.plan_id, sub.workspace_id).run();
      }
    }
    return true;
  } catch (e) {
    console.error('[Billing] Failed to activate subscription:', e);
    return false;
  }
}

export async function recordPayment(
  env: any,
  payment: {
    workspaceId?: string;
    subscriptionId?: string;
    razorpayPaymentId: string;
    razorpayOrderId?: string;
    razorpaySubscriptionId?: string;
    amount: number;
    currency?: string;
    status?: string;
    method?: string;
  }
): Promise<boolean> {
  if (!payment.workspaceId) {
    console.warn('[Billing] Payment not recorded (no workspace link):', payment.razorpayPaymentId);
    return false;
  }
  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO payments
         (id, workspace_id, subscription_id, razorpay_payment_id, razorpay_order_id,
          razorpay_subscription_id, amount, currency, status, method, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    ).bind(
      crypto.randomUUID(),
      payment.workspaceId || null,
      payment.subscriptionId || null,
      payment.razorpayPaymentId,
      payment.razorpayOrderId || null,
      payment.razorpaySubscriptionId || null,
      payment.amount,
      payment.currency || 'INR',
      payment.status || 'captured',
      payment.method || null
    ).run();
    return true;
  } catch (e) {
    console.error('[Billing] Failed to record payment:', e);
    return false;
  }
}

export async function downgradeWorkspaceToFree(env: any, workspaceId: string, freePlanId?: string | null): Promise<void> {
  try {
    const planId = freePlanId ?? await getFreePlanId(env);
    if (planId) {
      await env.DB.prepare('UPDATE workspaces SET plan_id = ? WHERE id = ?').bind(planId, workspaceId).run();
    }
  } catch (e) {
    console.error('[Billing] Failed to downgrade workspace:', e);
  }
}

// ---------------------------------------------------------------------------
// Expiry cron — downgrade workspaces whose access window has passed
// ---------------------------------------------------------------------------

export async function expireSubscriptions(env: any): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const freePlanId = await getFreePlanId(env);
  let expired = 0;

  // Drain in bounded batches so a backlog can't stall a single cron tick
  for (let pass = 0; pass < 10; pass++) {
    let rows: any = { results: [] };
    try {
      rows = await env.DB.prepare(
        `SELECT s.id, s.workspace_id FROM subscriptions s
         WHERE s.current_period_end IS NOT NULL AND s.current_period_end < ?
         AND ((s.status = 'active' AND (s.billing_type = 'one_time' OR s.cancel_at_period_end = 1)) OR s.status = 'completed')
         LIMIT 500`
      ).bind(now).all();
    } catch (e) {
      console.error('[Billing] Expiry scan failed:', e);
      return expired;
    }

    if (!(rows.results || []).length) break;

    for (const row of rows.results || []) {
      try {
        const upd: any = await env.DB.prepare(
          "UPDATE subscriptions SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('active', 'completed')"
        ).bind(row.id).run();
        if ((upd?.meta?.changes ?? 0) > 0) {
          expired++;
          await downgradeWorkspaceToFree(env, row.workspace_id, freePlanId);
        }
      } catch (e) {
        console.error('[Billing] Failed to expire subscription:', e);
      }
    }

    if ((rows.results || []).length < 500) break;
  }
  return expired;
}

// ---------------------------------------------------------------------------
// Webhook processing (idempotent via webhook_events.razorpay_event_id)
// ---------------------------------------------------------------------------

const WEBHOOK_STATUS_MAP: Record<string, string> = {
  created: 'created',
  authenticated: 'authenticated',
  active: 'active',
  past_due: 'past_due',
  pending: 'paused',
  halted: 'paused',
  paused: 'paused',
  resumed: 'active',
  completed: 'completed',
  cancelled: 'cancelled',
  expired: 'expired',
};

export interface WebhookResult {
  processed: boolean;
  duplicate: boolean;
  event: string;
}

export async function handleRazorpayWebhook(env: any, body: any): Promise<WebhookResult> {
  const event: string = body?.event || '';
  if (!event || !body?.payload) {
    return { processed: false, duplicate: false, event };
  }

  const subEntity = body.payload.subscription?.entity;
  const paymentEntity = body.payload.payment?.entity;
  // Payment-bound events (every renewal + every payment.* event) are keyed on
  // the payment id so each cycle is processed; one-shot subscription
  // transitions (activated/completed/cancelled) stay keyed on the sub id so
  // webhook retries can't double-downgrade a re-subscribed workspace.
  const isPaymentBound = event.startsWith('payment.') || event === 'subscription.charged';
  const entityId = (isPaymentBound && paymentEntity?.id ? paymentEntity.id : subEntity?.id) || '';
  if (!entityId) {
    return { processed: false, duplicate: false, event };
  }
  const idemKey = `${event}:${entityId}`;
  console.log(`[Billing] Webhook received: ${event} (idemKey=${idemKey}, hasPayment=${!!paymentEntity}, hasSubscription=${!!subEntity})`);

  try {
    // Idempotency: record the event first; on conflict it was already handled
    const inserted: any = await env.DB.prepare(
      `INSERT INTO webhook_events (id, razorpay_event_id, event_type, payload_json, processed, received_at)
       VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
       ON CONFLICT(razorpay_event_id) DO NOTHING RETURNING id`
    ).bind(crypto.randomUUID(), idemKey, event, JSON.stringify(body)).first();
    if (!inserted) {
      return { processed: true, duplicate: true, event };
    }
  } catch (e) {
    console.error('[Billing] Webhook idempotency insert failed:', e);
  }

  try {
    if (event === 'subscription.charged' || event === 'subscription.activated') {
      const appliedSub = await applySubscriptionEntity(env, subEntity);
      if (paymentEntity) {
        await applyPaymentEntity(env, paymentEntity, subEntity, appliedSub);
      }
    } else if (event.startsWith('subscription.')) {
      if (event === 'subscription.completed' || event === 'subscription.cancelled') {
        await applySubscriptionEntity(env, subEntity, true);
      } else {
        await applySubscriptionEntity(env, subEntity);
      }
    } else if (event === 'payment.captured') {
      await applyPaymentEntity(env, paymentEntity, subEntity);
    } else if (event === 'payment.failed') {
      const failedSub: any = await applyPaymentEntity(env, paymentEntity, subEntity);
      // The payload has no subscription entity, so use the payment's
      // subscription_id lookup result to mark the renewal as past due.
      if (failedSub?.razorpay_subscription_id) await markPastDue(env, failedSub.razorpay_subscription_id);
    } else if (event === 'payment.refunded') {
      await applyPaymentEntity(env, paymentEntity, subEntity);
    }
  } catch (e) {
    console.error(`[Billing] Webhook ${event} processing error:`, e);
  }

  return { processed: true, duplicate: false, event };
}

async function applySubscriptionEntity(env: any, subEntity: any, forceDowngrade = false): Promise<any | null> {
  if (!subEntity?.id) return null;
  const status = WEBHOOK_STATUS_MAP[subEntity.status] || subEntity.status;
  const sub: any = await env.DB.prepare(
    'SELECT id, workspace_id, plan_id, status FROM subscriptions WHERE razorpay_subscription_id = ?'
  ).bind(subEntity.id).first();
  if (!sub) {
    console.warn(`[Billing] Webhook for unknown Razorpay subscription ${subEntity.id} (status=${subEntity.status}). ` +
      `Check that /api/billing/subscribe stored the razorpay_subscription_id.`);
    return null;
  }

  // Don't let a late-arriving authenticated event regress an active row.
  if (sub.status === 'active' && status === 'authenticated') {
    return sub;
  }

  const periodStart = subEntity.current_start ? Number(subEntity.current_start) : undefined;
  const periodEnd = subEntity.current_end ? Number(subEntity.current_end) : undefined;

  const sets = ["status = ?", "updated_at = CURRENT_TIMESTAMP"];
  const vals: any[] = [status];
  if (periodStart) { sets.push('current_period_start = ?'); vals.push(periodStart); }
  if (periodEnd) { sets.push('current_period_end = ?'); vals.push(periodEnd); }
  vals.push(sub.id);
  await env.DB.prepare(`UPDATE subscriptions SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();

  if (forceDowngrade || status === 'completed' || status === 'cancelled' || status === 'expired') {
    await downgradeWorkspaceToFree(env, sub.workspace_id);
  } else if (status === 'active' || status === 'authenticated') {
    // Keep pointing the workspace at the subscribed plan (re-activation)
    if (sub.plan_id) {
      await env.DB.prepare('UPDATE workspaces SET plan_id = ? WHERE id = ?')
        .bind(sub.plan_id, sub.workspace_id).run();
    }
  }
  return sub;
}

async function applyPaymentEntity(env: any, paymentEntity: any, subEntity: any, preloadedSub: any = null): Promise<any | null> {
  if (!paymentEntity?.id) return null;
  let sub = preloadedSub;
  if (!sub) {
    // Subscriptions aren't linked by order_id (the auth order is never
    // stored), so also try the payment's subscription_id when present.
    sub = subEntity?.id
      ? await env.DB.prepare('SELECT id, workspace_id, plan_id, billing_type, status, razorpay_subscription_id FROM subscriptions WHERE razorpay_subscription_id = ?')
          .bind(subEntity.id).first()
      : paymentEntity?.subscription_id
        ? await env.DB.prepare('SELECT id, workspace_id, plan_id, billing_type, status, razorpay_subscription_id FROM subscriptions WHERE razorpay_subscription_id = ?')
            .bind(paymentEntity.subscription_id).first()
        : await env.DB.prepare('SELECT id, workspace_id, plan_id, billing_type, status, razorpay_subscription_id FROM subscriptions WHERE razorpay_order_id = ?')
            .bind(paymentEntity.order_id || '').first();
    if (!sub) {
      console.warn(`[Billing] payment.${paymentEntity.status || 'event'} for payment ${paymentEntity.id} could not be linked to a subscription ` +
        `(order_id=${paymentEntity.order_id || 'none'}, subscription_id=${paymentEntity.subscription_id || 'none'})`);
    }
  }

  await recordPayment(env, {
    workspaceId: sub?.workspace_id || undefined,
    subscriptionId: sub?.id || undefined,
    razorpayPaymentId: paymentEntity.id,
    razorpayOrderId: paymentEntity.order_id || undefined,
    razorpaySubscriptionId: subEntity?.id || undefined,
    amount: Number(paymentEntity.amount || 0) / 100,
    currency: paymentEntity.currency || 'INR',
    status: paymentEntity.status === 'captured' ? 'captured'
      : paymentEntity.status === 'refunded' ? 'refunded'
      : paymentEntity.status === 'failed' ? 'failed' : 'pending',
    method: paymentEntity.method || undefined,
  });

  // One-time orders have no subscription.* events: if the checkout was
  // captured but the user never completed /verify, activate it here so the
  // customer gets the plan and the pending row doesn't block re-subscribing.
  if (paymentEntity.status === 'captured' && sub && sub.billing_type === 'one_time' && ['created', 'authenticated'].includes(sub.status)) {
    const plan: any = await env.DB.prepare('SELECT billing_period, billing_interval FROM plans WHERE id = ?')
      .bind(sub.plan_id).first();
    const now = Math.floor(Date.now() / 1000);
    await activateSubscription(env, {
      subscriptionId: sub.id,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: plan ? now + periodDays(plan.billing_period, plan.billing_interval) * 86400 : undefined,
    });
  }
  return sub;
}

async function markPastDue(env: any, razorpaySubscriptionId: string): Promise<void> {
  try {
    await env.DB.prepare(
      "UPDATE subscriptions SET status = 'past_due', updated_at = CURRENT_TIMESTAMP WHERE razorpay_subscription_id = ? AND status = 'active'"
    ).bind(razorpaySubscriptionId).run();
  } catch (e) {
    console.error('[Billing] Failed to mark past_due:', e);
  }
}
