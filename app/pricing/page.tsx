'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';

interface Plan { id: string; name: string; description: string; upfront_price: number; pay_as_you_go_rate: number; features: string[]; }

function PricingSkeleton() {
  return (
    <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-2xl p-8">
          <Skeleton className="h-6 w-24 mb-2" /> <Skeleton className="h-4 w-40 mb-6" /> <Skeleton className="h-10 w-32 mb-6" />
          <div className="space-y-3 mb-8">{ [1,2,3,4].map(j => <Skeleton key={j} className="h-4 w-full" />) }</div>
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

export default function PricingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/plans').then(r => { if (!r.ok) throw new Error('Failed to load plans'); return r.json(); })
      .then((data: any) => { if (data.plans) setPlans(data.plans); setLoading(false); })
      .catch(() => { setError('Unable to load pricing plans. Please try again later.'); setLoading(false); });
  }, []);

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950 py-20 px-6 relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-10%] w-[400px] h-[400px] bg-primary-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="max-w-7xl mx-auto relative">
        <Link href="/" className="inline-flex items-center gap-2 text-surface-500 hover:text-surface-900 dark:hover:text-white mb-12 transition-colors"><ArrowLeft className="w-4 h-4" /> Home</Link>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-16">
          <Badge variant="primary" className="mb-4">Pricing</Badge>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-surface-900 dark:text-white mb-4 font-['Inter']">Simple, transparent <span className="gradient-text">pricing</span></h1>
          <p className="text-lg text-surface-500 dark:text-surface-400 max-w-xl mx-auto">Choose the plan that fits your business. Pay-as-you-go rates with upfront options for advanced features.</p>
        </motion.div>
        {error ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
              <Loader2 className="w-8 h-8 text-red-500" />
            </div>
            <p className="text-surface-600 dark:text-surface-400 mb-4">{error}</p>
            <Button variant="secondary" onClick={() => { setLoading(true); setError(''); fetch('/api/plans').then(r => r.json()).then((data: any) => { if (data.plans) setPlans(data.plans); setLoading(false); }).catch(() => { setError('Unable to load pricing plans.'); setLoading(false); }); }}>Try Again</Button>
          </div>
        ) : loading ? <PricingSkeleton /> : (
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {plans.map((plan, i) => {
              const isPopular = i === 1;
              return (
                <motion.div key={plan.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                  className={`relative flex flex-col p-8 rounded-2xl border transition-all ${isPopular ? 'bg-surface-900 dark:bg-surface-800 border-primary-500 shadow-2xl shadow-primary-500/10 md:-translate-y-4' : 'bg-white dark:bg-surface-900 border-surface-200 dark:border-surface-800 hover:shadow-card-hover'}`}>
                  {isPopular && <div className="absolute -top-3 left-1/2 -translate-x-1/2"><Badge variant="primary" size="md">Most Popular</Badge></div>}
                  <h3 className={`text-xl font-bold mb-2 font-['Inter'] ${isPopular ? 'text-white' : 'text-surface-900 dark:text-surface-100'}`}>{plan.name}</h3>
                  <p className={`text-sm mb-6 flex-1 ${isPopular ? 'text-surface-400' : 'text-surface-500'}`}>{plan.description}</p>
                  <div className="mb-6 space-y-1 pb-6 border-b border-surface-200 dark:border-surface-700/50">
                    <div className="flex items-baseline gap-1">
                      <span className={`text-4xl font-extrabold font-['Inter'] ${isPopular ? 'text-white' : 'text-surface-900 dark:text-surface-100'}`}>${plan.upfront_price}</span>
                      <span className={`text-sm font-medium ${isPopular ? 'text-surface-400' : 'text-surface-500'}`}> upfront</span>
                    </div>
                    <div className={`text-sm font-medium ${isPopular ? 'text-primary-300' : 'text-primary-600 dark:text-primary-400'}`}>+ ${plan.pay_as_you_go_rate} / message</div>
                  </div>
                  <ul className="space-y-4 mb-8 flex-1">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className={`flex gap-3 text-sm ${isPopular ? 'text-surface-300' : 'text-surface-600 dark:text-surface-300'}`}>
                        <Check className={`w-5 h-5 shrink-0 mt-0.5 ${isPopular ? 'text-primary-400' : 'text-emerald-500'}`} />{feature}
                      </li>
                    ))}
                  </ul>
                  <Link href="/register" className={`block w-full text-center font-medium rounded-xl py-3.5 transition-all text-sm ${isPopular ? 'bg-primary-600 text-white hover:bg-primary-700' : 'bg-surface-100 dark:bg-surface-800 text-surface-900 dark:text-surface-100 hover:bg-surface-200 dark:hover:bg-surface-700'}`}>Choose {plan.name}</Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
