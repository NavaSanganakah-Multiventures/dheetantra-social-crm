"use client";

import React, { useState } from 'react';
import { MessageSquare, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'motion/react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();

  const requestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/auth/send-otp', { method: 'POST', body: JSON.stringify({ email }) });
      const data: any = await res.json();
      if (res.ok) {
        setStep('otp');
        setMessage('OTP भेजा गया है! कृपया अपना इनबॉक्स चेक करें।');
      } else {
        setMessage(data.error || 'OTP भेजने में विफल।');
      }
    } catch (err) {
      setMessage('कुछ गलत हो गया। कृपया पुनः प्रयास करें।');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email, otp }) });
      const data: any = await res.json();
      if (res.ok && data.user) {
        if (data.workspaceId) {
          localStorage.setItem('workspaceId', data.workspaceId);
        }
        router.push('/dashboard');
      } else {
        setMessage(data.error || 'अमान्य OTP।');
      }
    } catch (err) {
      setMessage('कुछ गलत हो गया। कृपया पुनः प्रयास करें।');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4 font-sans relative overflow-hidden">
      {/* Background Ornaments */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-purple-500/10 dark:bg-purple-500/20 rounded-full blur-3xl pointer-events-none"></div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-2xl relative z-10"
      >
        <Link href="/" className="flex items-center justify-center w-12 h-12 rounded-2xl bg-zinc-900 dark:bg-white mb-6 mx-auto hover:scale-105 transition-transform">
          <MessageSquare className="w-6 h-6 text-white dark:text-zinc-900" />
        </Link>
        <h1 className="text-3xl font-bold text-center mb-2 tracking-tight font-display">लॉगिन</h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm text-center mb-8">
          {step === 'email' ? 'अपने खाते में सुरक्षित रूप से साइन इन करें' : `पासकोड ${email} पर भेजा गया है`}
        </p>

        {step === 'email' ? (
          <form onSubmit={requestOtp} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-2 text-zinc-700 dark:text-zinc-300">ईमेल पता</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
                placeholder="aapka@email.com"
              />
            </div>
            <button disabled={loading || !email} type="submit" className="w-full bg-indigo-600 text-white font-medium rounded-xl px-4 py-3 hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? 'कोड भेज रहे हैं...' : <>ईमेल के साथ आगे बढ़ें <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyOtp} className="space-y-5">
             <div>
              <label className="block text-sm font-medium mb-2 text-zinc-700 dark:text-zinc-300">6-अंकीय कोड</label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                required
                maxLength={6}
                className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-center tracking-[0.5em] text-lg font-mono placeholder:text-zinc-300"
                placeholder="000000"
              />
            </div>
            <button disabled={loading || otp.length !== 6} type="submit" className="w-full bg-indigo-600 text-white font-medium rounded-xl px-4 py-3 hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/25 transition-all disabled:opacity-50">
              {loading ? 'सत्यापन कर रहे हैं...' : 'कोड सत्यापित करें'}
            </button>
            <div className="text-center mt-4">
              <button type="button" onClick={() => setStep('email')} className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
                कोई दूसरा ईमेल इस्तेमाल करें
              </button>
            </div>
          </form>
        )}
        
        {message && <p className="text-sm text-center mt-6 text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-500/10 py-2 rounded-lg">{message}</p>}

        <div className="mt-8 text-center border-t border-zinc-200 dark:border-zinc-800 pt-6">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            DheeTantra पर नए हैं?{' '}
            <Link href="/register" className="font-semibold text-zinc-900 dark:text-white hover:underline">
              यहाँ रजिस्टर करें
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
