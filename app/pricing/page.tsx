"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, MessageSquare, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

interface Plan {
  id: string;
  name: string;
  description: string;
  upfront_price: number;
  pay_as_you_go_rate: number;
  features: string[];
}

export default function PricingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/plans')
      .then(r => r.json())
      .then((data: any) => {
        if (data.plans) setPlans(data.plans);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans selection:bg-indigo-500/30 py-20 px-6">
      <div className="max-w-7xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white mb-12 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Home पर वापस जाएँ
        </Link>
        
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600 mb-6 shadow-lg shadow-indigo-500/20">
            <MessageSquare className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-zinc-900 dark:text-white mb-6 font-display">पारदर्शी और आसान प्राइसिंग</h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
            ऐसा प्लान चुनें जो आपके बढ़ते व्यवसाय के लिए सबसे उपयुक्त हो। पे-ऐज़-यू-गो के साथ-साथ कुछ विशेष फीचर्स के लिए अपफ्रंट प्राइस भी उपलब्ध हैं।
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-20">
             <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {plans.map((plan, i) => {
              const isPopular = i === 1; // Highlight the middle plan typically
              return (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  key={plan.id} 
                  className={`relative flex flex-col p-8 rounded-3xl transition-all ${isPopular ? 'bg-zinc-900 dark:bg-zinc-800 border-2 border-indigo-500 shadow-2xl shadow-indigo-500/10 md:-translate-y-4 text-white' : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:shadow-xl'}`}
                >
                  {isPopular && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-indigo-500 text-white text-xs font-bold uppercase tracking-wider py-1 px-3 rounded-full">
                      Most Popular
                    </div>
                  )}
                  <h3 className={`text-xl font-bold mb-2 font-display ${isPopular ? 'text-white' : 'text-zinc-900 dark:text-white'}`}>{plan.name}</h3>
                  <p className={`text-sm mb-6 flex-1 ${isPopular ? 'text-zinc-400' : 'text-zinc-500'}`}>{plan.description}</p>
                  
                  <div className="mb-6 space-y-1 border-b border-zinc-200 dark:border-zinc-700/50 pb-6">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold">${plan.upfront_price}</span>
                      <span className={`text-sm font-medium ${isPopular ? 'text-zinc-400' : 'text-zinc-500'}`}> अपफ्रंट</span>
                    </div>
                    <div className={`text-sm font-medium ${isPopular ? 'text-indigo-300' : 'text-indigo-600 dark:text-indigo-400'}`}>
                      + ${plan.pay_as_you_go_rate} / संदेश
                    </div>
                  </div>
                  
                  <ul className="space-y-4 mb-8 flex-1">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className={`flex gap-3 text-sm ${isPopular ? 'text-zinc-300' : 'text-zinc-600 dark:text-zinc-300'}`}>
                        <span className={isPopular ? 'text-indigo-400' : 'text-emerald-500'}>✓</span> {feature}
                      </li>
                    ))}
                  </ul>
                  
                  <Link href="/register" className={`block w-full text-center font-medium rounded-xl py-3 transition-colors ${isPopular ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}>
                    चुनें {plan.name}
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
