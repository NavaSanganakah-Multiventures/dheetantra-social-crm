'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, Loader2, AlertTriangle, CreditCard, Sparkles } from 'lucide-react';
import { useLang } from '@/lib/i18n';

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

function currencySymbol(currency?: string): string {
  return CURRENCY_SYMBOLS[currency || 'INR'] || '₹';
}

interface Plan {
  id: string;
  name: string;
  description: string;
  upfront_price: number;
  pay_as_you_go_rate: number;
  features: string[];
  currency?: string;
  billing_type?: string;
  billing_period?: string;
  billing_interval?: number;
  is_free?: number;
  is_active?: number;
  sort_order?: number;
}

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_subscription_id?: string;
  razorpay_order_id?: string;
  razorpay_signature: string;
}

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface SubscriptionModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function SubscriptionModal({ open, onClose, onSuccess }: SubscriptionModalProps) {
  const { t } = useLang();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [buyingPlanId, setBuyingPlanId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch('/api/plans')
      .then(r => {
        if (!r.ok) throw new Error('Failed to load plans');
        return r.json();
      })
      .then((data: any) => {
        if (cancelled) return;
        if (data.plans) {
          setPlans(data.plans);
          setError('');
        } else {
          throw new Error('Invalid response');
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(t('pricing.errorLoad'));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, t]);

  const handleClose = useCallback(() => {
    setBuyingPlanId(null);
    onClose();
  }, [onClose]);

  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise(resolve => {
      if (window.Razorpay) return resolve(true);
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const subscribe = async (plan: Plan) => {
    setBuyingPlanId(plan.id);
    setError('');
    try {
      const workspaceId = localStorage.getItem('workspaceId');
      const res = await fetch('/api/billing/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(workspaceId ? { 'x-workspace-id': workspaceId } : {}),
        },
        body: JSON.stringify({ plan_id: plan.id }),
      });
      const data: any = await res.json();

      if (!res.ok) {
        if (data.cancelExisting) {
          setError(t('pricing.errorExisting'));
          setBuyingPlanId(null);
          return;
        }
        setError(data.error || t('pricing.errorPayment'));
        setBuyingPlanId(null);
        return;
      }

      // Free plan — activated instantly on the backend
      if (data.free) {
        handleClose();
        onSuccess?.();
        return;
      }

      const loaded = await loadRazorpayScript();
      if (!loaded) {
        setError(t('pricing.errorGateway'));
        setBuyingPlanId(null);
        return;
      }

      const options: any = {
        key: data.key_id,
        name: 'DheeTantra',
        description: `${data.name}${data.currency ? ` (${data.currency})` : ''}`,
        prefill: data.prefill || {},
        theme: { color: '#4f46e5' },
        notes: { dheetantra_subscription_id: data.db_subscription_id },
        handler: async (response: RazorpayResponse) => {
          try {
            const verifyRes = await fetch('/api/billing/verify', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(workspaceId ? { 'x-workspace-id': workspaceId } : {}),
              },
              body: JSON.stringify({
                subscription_id: data.db_subscription_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_subscription_id: response.razorpay_subscription_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const verifyData: any = await verifyRes.json();
            if (verifyData.success) {
              handleClose();
              onSuccess?.();
            } else {
              setError(t('pricing.errorVerify'));
              setBuyingPlanId(null);
            }
          } catch {
            setError(t('pricing.errorVerify'));
            setBuyingPlanId(null);
          }
        },
        modal: { ondismiss: () => { setBuyingPlanId(null); } },
      };

      if (data.subscription_id) {
        options.subscription_id = data.subscription_id;
      } else if (data.order_id) {
        options.order_id = data.order_id;
        options.amount = data.amount;
        options.currency = data.currency || 'INR';
      }

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', () => {
        setError(t('pricing.errorPayment'));
        setBuyingPlanId(null);
      });
      rzp.open();
    } catch {
      setError(t('pricing.errorStart'));
      setBuyingPlanId(null);
    }
  };

  const activePlans = plans.filter(p => p.is_active !== 0);
  const nonFreePlans = activePlans.filter(p => p.is_free !== 1);
  const popularPlanId = nonFreePlans[1]?.id || activePlans[1]?.id;

  // Render via a portal directly on <body>: the dashboard mounts this modal
  // inside a transformed (motion) + overflow-auto container, where position:
  // fixed breaks. That also keeps the overlay's stacking clean under the
  // Razorpay checkout iframe (which mounts on <body> with z-index 2147483647).
  // Guard for static export: document is undefined during server prerender
  // (currently only reached client-side, but a future default-tab/deep-link
  // change would otherwise crash `next build`).
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-4xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-4 px-6 py-5 border-b border-surface-200 dark:border-surface-800 flex-shrink-0 bg-surface-50/60 dark:bg-surface-950/40">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-primary-600/10 border border-primary-500/20 flex items-center justify-center flex-shrink-0">
                  <CreditCard className="w-5 h-5 text-primary-500" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-surface-900 dark:text-white font-display flex items-center gap-2 flex-wrap">
                    {t('pricing.title1')} <span className="gradient-text">{t('pricing.title2')}</span>
                  </h3>
                  <p className="text-xs text-surface-500 mt-0.5 truncate">{t('pricing.subtitle')}</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-xl text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-900 dark:hover:text-white transition-colors flex-shrink-0"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
              {error && (
                <div className="mb-5 p-4 rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <div className="text-sm">{error}</div>
                </div>
              )}

              {loading ? (
                <div className="grid md:grid-cols-3 gap-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-2xl p-6 animate-pulse">
                      <div className="h-5 w-24 bg-surface-200 dark:bg-surface-800 rounded mb-2" />
                      <div className="h-3 w-40 bg-surface-200 dark:bg-surface-800 rounded mb-6" />
                      <div className="h-9 w-28 bg-surface-200 dark:bg-surface-800 rounded mb-6" />
                      <div className="space-y-3 mb-8">
                        {[1, 2, 3, 4].map(j => (
                          <div key={j} className="h-3 w-full bg-surface-200 dark:bg-surface-800 rounded" />
                        ))}
                      </div>
                      <div className="h-11 w-full bg-surface-200 dark:bg-surface-800 rounded-xl" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid md:grid-cols-3 gap-4">
                  {activePlans.map((plan, i) => {
                    const isPopular = plan.id === popularPlanId;
                    const isFree = plan.is_free === 1;
                    const periodLabel = plan.billing_type === 'recurring'
                      ? ` / ${plan.billing_period === 'yearly' ? t('pricing.year') : plan.billing_period === 'weekly' ? t('pricing.week') : t('pricing.month')}`
                      : '';
                    return (
                      <motion.div
                        key={plan.id}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.07 }}
                        className={`relative flex flex-col p-6 rounded-2xl border transition-all ${
                          isPopular
                            ? 'bg-surface-900 dark:bg-surface-800 border-primary-500 shadow-xl shadow-primary-500/10'
                            : 'bg-white dark:bg-surface-950 border-surface-200 dark:border-surface-800'
                        }`}
                      >
                        {isPopular && (
                          <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-1 rounded-full bg-primary-600 text-white text-[10px] font-bold uppercase tracking-wider shadow-lg shadow-primary-600/30">
                            <Sparkles className="w-3 h-3" /> {t('pricing.mostPopular')}
                          </div>
                        )}
                        <h4 className={`text-base font-bold mb-1 font-display ${isPopular ? 'text-white' : 'text-surface-900 dark:text-surface-100'}`}>
                          {plan.name}
                        </h4>
                        <p className={`text-xs mb-4 ${isPopular ? 'text-surface-400' : 'text-surface-500'}`}>
                          {plan.description}
                        </p>

                        <div className="mb-4 pb-4 border-b border-surface-200 dark:border-surface-700/50">
                          <div className="flex items-baseline gap-1">
                            <span className={`text-3xl font-extrabold ${isPopular ? 'text-white' : 'text-surface-900 dark:text-surface-100'}`}>
                              {isFree ? '₹0' : `${currencySymbol(plan.currency)}${plan.upfront_price}`}
                            </span>
                            {!isFree && (
                              <span className={`text-xs font-medium ${isPopular ? 'text-surface-400' : 'text-surface-500'}`}>
                                {plan.billing_type === 'one_time' ? t('pricing.oneTime') : periodLabel}
                              </span>
                            )}
                          </div>
                          {plan.pay_as_you_go_rate > 0 && (
                            <div className={`text-xs font-medium mt-1 ${isPopular ? 'text-primary-300' : 'text-primary-600 dark:text-primary-400'}`}>
                              + {currencySymbol(plan.currency)}{plan.pay_as_you_go_rate} {t('pricing.perMessage')}
                            </div>
                          )}
                        </div>

                        <ul className="space-y-2.5 mb-6 flex-1">
                          {(plan.features || []).map((feature, idx) => (
                            <li key={idx} className={`flex gap-2.5 text-xs ${isPopular ? 'text-surface-300' : 'text-surface-600 dark:text-surface-300'}`}>
                              <Check className={`w-4 h-4 shrink-0 mt-0.5 ${isPopular ? 'text-primary-400' : 'text-emerald-500'}`} />
                              {feature}
                            </li>
                          ))}
                        </ul>

                        <button
                          onClick={() => subscribe(plan)}
                          disabled={!!buyingPlanId}
                          className={`w-full py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-60 ${
                            isPopular
                              ? 'bg-primary-600 hover:bg-primary-500 text-white shadow-lg shadow-primary-600/25'
                              : 'bg-surface-100 dark:bg-surface-800 hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-900 dark:text-surface-100'
                          }`}
                        >
                          {buyingPlanId === plan.id ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" /> {t('pricing.processing')}
                            </>
                          ) : isFree ? (
                            t('pricing.startFree')
                          ) : (
                            t('pricing.subscribe')
                          )}
                        </button>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-surface-200 dark:border-surface-800 flex-shrink-0 bg-surface-50/60 dark:bg-surface-950/40">
              <p className="text-[10px] text-surface-500 text-center">
                🔒 Payments are securely processed by Razorpay. You can cancel your subscription at any time.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
