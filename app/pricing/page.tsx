'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Loader2, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';

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

function PricingSkeleton() {
  return (
    <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-2xl p-8">
          <Skeleton className="h-6 w-24 mb-2" />
          <Skeleton className="h-4 w-40 mb-6" />
          <Skeleton className="h-10 w-32 mb-6" />
          <div className="space-y-3 mb-8">
            {[1, 2, 3, 4].map(j => (
              <Skeleton key={j} className="h-4 w-full" />
            ))}
          </div>
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

export default function PricingPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [user, setUser] = useState<any>(null);
  const [buyingPlanId, setBuyingPlanId] = useState<string | null>(null);
  const [status, setStatus] = useState<'success' | 'failed' | 'cancelled' | null>(null);

  useEffect(() => {
    // Parse ?status= banner (static export: no server-side search params)
    Promise.resolve().then(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('status') === 'success') setStatus('success');
      else if (params.get('status') === 'failed') setStatus('failed');
      else if (params.get('status') === 'cancelled') setStatus('cancelled');
    });

    fetch('/api/auth/me')
      .then(r => r.json())
      .then((data: any) => {
        if (data.user) setUser(data.user);
      })
      .catch(() => { /* not logged in is fine */ });
  }, []);

  const loadPlans = useCallback(() => {
    fetch('/api/plans')
      .then(r => {
        if (!r.ok) throw new Error('Failed to load plans');
        return r.json();
      })
      .then((data: any) => {
        if (data.plans) setPlans(data.plans);
        else throw new Error('Invalid response');
        setLoading(false);
      })
      .catch(() => {
        setError('Unable to load pricing plans. Please try again later.');
        setLoading(false);
      });
  }, []);

  useEffect(() => { loadPlans(); }, [loadPlans]);

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
    if (!user) {
      router.push('/login?next=/pricing');
      return;
    }
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
          setError('आपके workspace पर पहले से एक active subscription है। आप इसे Dashboard → Settings → Plan & Billing से cancel कर सकते हैं।');
          setBuyingPlanId(null);
          return;
        }
        setError(data.error || 'Payment setup failed. Please try again.');
        setBuyingPlanId(null);
        return;
      }

      // Free plan — activated instantly on the backend
      if (data.free) {
        window.location.assign('/pricing?status=success');
        return;
      }

      const loaded = await loadRazorpayScript();
      if (!loaded) {
        setError('Payment gateway failed to load. Please try again.');
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
              window.location.assign('/pricing?status=success');
            } else {
              window.location.assign('/pricing?status=failed');
            }
          } catch {
            window.location.assign('/pricing?status=failed');
          }
        },
        modal: { ondismiss: () => { window.location.assign('/pricing?status=cancelled'); } },
      };

      if (data.subscription_id) {
        options.subscription_id = data.subscription_id;
      } else if (data.order_id) {
        options.order_id = data.order_id;
        options.amount = data.amount;
        options.currency = data.currency || 'INR';
      }

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', () => { window.location.assign('/pricing?status=failed'); });
      rzp.open();
    } catch {
      setError('Something went wrong while starting the payment. Please try again.');
      setBuyingPlanId(null);
    }
  };

  const activePlans = plans.filter(p => p.is_active !== 0);
  const nonFreePlans = activePlans.filter(p => p.is_free !== 1);
  const popularPlanId = nonFreePlans[1]?.id || activePlans[1]?.id;

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950 py-20 px-6 relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-10%] w-[400px] h-[400px] bg-primary-500/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-7xl mx-auto relative">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-surface-500 hover:text-surface-900 dark:hover:text-white mb-12 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Home
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <Badge variant="primary" className="mb-4">
            Pricing
          </Badge>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-surface-900 dark:text-white mb-4 font-['Inter']">
            Simple, transparent{' '}
            <span className="gradient-text">pricing</span>
          </h1>
          <p className="text-lg text-surface-500 dark:text-surface-400 max-w-xl mx-auto">
            Choose the plan that fits your business. Recurring subscriptions and
            one-time options with pay-as-you-go rates.
          </p>
        </motion.div>

        {status && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`max-w-2xl mx-auto mb-10 p-4 rounded-2xl border flex items-center gap-3 ${
              status === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                : status === 'failed'
                ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
                : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
            }`}
          >
            <Check className="w-5 h-5 shrink-0" />
            <div>
              {status === 'success' && (
                <p className="text-sm font-medium">
                  भुगतान सफल! आपका plan active हो गया है। अगर payment successful हुआ है लेकिन plan reflect नहीं हुआ, तो कुछ seconds में refresh करें।
                </p>
              )}
              {status === 'failed' && (
                <p className="text-sm font-medium">
                  भुगतान असफल रहा या verify नहीं हो पाया। अगर पैसे कट गए हैं तो support से संपर्क करें।
                </p>
              )}
              {status === 'cancelled' && (
                <p className="text-sm font-medium">आपने भुगतान रद्द कर दिया। कोई शुल्क नहीं लिया गया।</p>
              )}
            </div>
          </motion.div>
        )}

        {error && (
          <div className="max-w-2xl mx-auto mb-10 p-4 rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <div className="text-sm">{error}</div>
          </div>
        )}

        {loading ? (
          <PricingSkeleton />
        ) : (
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {activePlans.map((plan, i) => {
              const isPopular = plan.id === popularPlanId;
              const isFree = plan.is_free === 1;
              const periodLabel = plan.billing_type === 'recurring'
                ? ` / ${plan.billing_period === 'yearly' ? 'year' : plan.billing_period === 'weekly' ? 'week' : 'month'}`
                : '';
              return (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  key={plan.id}
                  className={`relative flex flex-col p-8 rounded-2xl border transition-all ${
                    isPopular
                      ? 'bg-surface-900 dark:bg-surface-800 border-primary-500 shadow-2xl shadow-primary-500/10 md:-translate-y-4'
                      : 'bg-white dark:bg-surface-900 border-surface-200 dark:border-surface-800 hover:shadow-card-hover'
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge variant="primary" size="md">
                        Most Popular
                      </Badge>
                    </div>
                  )}
                  <h3
                    className={`text-xl font-bold mb-2 font-['Inter'] ${isPopular ? 'text-white' : 'text-surface-900 dark:text-surface-100'}`}
                  >
                    {plan.name}
                  </h3>
                  <p
                    className={`text-sm mb-6 flex-1 ${isPopular ? 'text-surface-400' : 'text-surface-500'}`}
                  >
                    {plan.description}
                  </p>

                  <div className="mb-6 space-y-1 pb-6 border-b border-surface-200 dark:border-surface-700/50">
                    <div className="flex items-baseline gap-1">
                      <span
                        className={`text-4xl font-extrabold font-['Inter'] ${isPopular ? 'text-white' : 'text-surface-900 dark:text-surface-100'}`}
                      >
                        {isFree ? '₹0' : `${currencySymbol(plan.currency)}${plan.upfront_price}`}
                      </span>
                      {!isFree && (
                        <span
                          className={`text-sm font-medium ${isPopular ? 'text-surface-400' : 'text-surface-500'}`}
                        >
                          {plan.billing_type === 'one_time' ? 'one-time' : periodLabel}
                        </span>
                      )}
                    </div>
                    {plan.pay_as_you_go_rate > 0 && (
                      <div
                        className={`text-sm font-medium ${isPopular ? 'text-primary-300' : 'text-primary-600 dark:text-primary-400'}`}
                      >
                        + {currencySymbol(plan.currency)}{plan.pay_as_you_go_rate} / message
                      </div>
                    )}
                  </div>

                  <ul className="space-y-4 mb-8 flex-1">
                    {(plan.features || []).map((feature, idx) => (
                      <li
                        key={idx}
                        className={`flex gap-3 text-sm ${isPopular ? 'text-surface-300' : 'text-surface-600 dark:text-surface-300'}`}
                      >
                        <Check
                          className={`w-5 h-5 shrink-0 mt-0.5 ${isPopular ? 'text-primary-400' : 'text-emerald-500'}`}
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <Button
                    variant={isPopular ? 'primary' : 'secondary'}
                    size="lg"
                    disabled={!!buyingPlanId}
                    loading={buyingPlanId === plan.id}
                    onClick={() => subscribe(plan)}
                    className="w-full"
                  >
                    {buyingPlanId === plan.id ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Processing...
                      </>
                    ) : isFree ? (
                      'Start Free'
                    ) : (
                      <>{user ? 'Subscribe' : 'Get Started'}</>
                    )}
                  </Button>
                </motion.div>
              );
            })}
          </div>
        )}

        {!user && !loading && (
          <p className="text-center text-sm text-surface-500 dark:text-surface-400 mt-10">
            <Link href="/login?next=/pricing" className="text-primary-600 dark:text-primary-400 hover:underline font-medium">
              पहले से account है? Login करें
            </Link>{' '}
            और subscription लें।
          </p>
        )}
      </div>
    </div>
  );
}
