'use client';

import React, { useState, useRef } from 'react';
import { UserPlus, ArrowRight, Mail, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { ThemeToggle } from '../../components/ui/ThemeToggle';
import { useLang, LangSwitcher } from '../../lib/i18n';

export default function RegisterPage() {
  const { t } = useLang();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [step, setStep] = useState<'details' | 'otp'>('details');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const router = useRouter();
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const requestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, type: 'register' }),
      });
      const data: any = await res.json();
      if (res.ok) {
        setStep('otp');
        setMessage(t('register.msgOtpSent'));
        setMessageType('success');
        setTimeout(() => otpRefs.current[0]?.focus(), 100);
      } else {
        setMessage(data.error || t('register.msgRegFail'));
        setMessageType('error');
      }
    } catch {
      setMessage(t('register.msgWrong'));
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const otpCode = otp.join('');
    if (otpCode.length !== 6) return;

    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: otpCode }),
      });
      const data: any = await res.json();
      if (res.ok && data.user) {
        if (data.workspaceId) {
          localStorage.setItem('workspaceId', data.workspaceId);
        }
        router.push('/dashboard');
      } else {
        setMessage(data.error || t('register.msgInvalidOtp'));
        setMessageType('error');
        setOtp(['', '', '', '', '', '']);
        otpRefs.current[0]?.focus();
      }
    } catch {
      setMessage(t('register.msgWrong'));
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-50 dark:bg-surface-950 p-4 font-sans relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-primary-500/10 dark:bg-primary-500/20 rounded-full blur-3xl pointer-events-none animate-float-delayed" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-cyan-500/10 dark:bg-cyan-500/20 rounded-full blur-3xl pointer-events-none animate-float" />

      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <LangSwitcher />
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md glass rounded-3xl p-8 shadow-glass-lg relative z-10"
      >
        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-primary-600 mb-6 mx-auto shadow-lg shadow-primary-500/30">
          <UserPlus className="w-6 h-6 text-white" />
        </div>

        <h1 className="text-3xl font-bold text-center mb-2 tracking-tight font-['Inter']">
          {t('register.createTitle')}
        </h1>
        <p className="text-surface-500 dark:text-surface-400 text-sm text-center mb-8">
          {step === 'details'
            ? t('register.subtitle')
            : t('register.codeSent', { email })}
        </p>

        <AnimatePresence mode="wait">
          {step === 'details' ? (
            <motion.form
              key="details"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              onSubmit={requestOtp}
              className="space-y-5"
            >
              <Input
                label={t('register.nameLabel')}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('register.namePlaceholder')}
                required
                icon={<User className="w-4 h-4" />}
              />
              <Input
                label={t('register.emailLabel')}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={t('register.emailPlaceholder')}
                required
                icon={<Mail className="w-4 h-4" />}
              />
              <Button
                type="submit"
                loading={loading}
                disabled={!email || !name}
                className="w-full"
              >
                {t('register.createBtn')} <ArrowRight className="w-5 h-5" />
              </Button>
            </motion.form>
          ) : (
            <motion.form
              key="otp"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              onSubmit={verifyOtp}
              className="space-y-5"
            >
              <div>
                <label className="block text-sm font-medium mb-3 text-center text-surface-700 dark:text-surface-300">
                  {t('register.otpLabel')}
                </label>
                <div className="flex gap-2 justify-center">
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      ref={el => {
                        otpRefs.current[index] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={e => handleOtpChange(index, e.target.value)}
                      onKeyDown={e => handleOtpKeyDown(index, e)}
                      className="w-11 h-12 text-center text-lg font-bold bg-white dark:bg-surface-950 border border-surface-300 dark:border-surface-700 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                    />
                  ))}
                </div>
              </div>
              <Button
                type="submit"
                loading={loading}
                disabled={otp.join('').length !== 6}
                className="w-full"
              >
                {t('register.verifyBtn')}
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setStep('details');
                    setOtp(['', '', '', '', '', '']);
                  }}
                  className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
                >
                  {t('register.editDetails')}
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {message && (
            <motion.p
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className={`text-sm text-center mt-6 font-medium py-2.5 rounded-lg ${
                messageType === 'success'
                  ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10'
                  : 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10'
              }`}
            >
              {message}
            </motion.p>
          )}
        </AnimatePresence>

        <div className="mt-8 text-center border-t border-surface-200 dark:border-surface-800 pt-6">
          <p className="text-sm text-surface-500 dark:text-surface-400">
            {t('register.haveAccount')}{' '}
            <Link
              href="/login"
              className="font-semibold text-primary-600 dark:text-primary-400 hover:underline"
            >
              {t('register.signIn')}
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
