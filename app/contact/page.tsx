'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail, Phone, MapPin, Send, CheckCircle, Sprout } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';

export default function ContactPage() {
  const [formData, setFormData] = useState({ name: '', email: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.name.trim()) errs.name = 'Name is required';
    if (!formData.email.trim()) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errs.email = 'Invalid email address';
    if (!formData.message.trim()) errs.message = 'Message is required';
    else if (formData.message.trim().length < 10) errs.message = 'Message must be at least 10 characters';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (res.ok) { setSubmitted(true); toast('success', 'Message sent successfully! We will get back to you soon.'); }
      else { const data: any = await res.json(); toast('error', data.error || 'Failed to send message. Please try again.'); }
    } catch { toast('error', 'Something went wrong. Please try again.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950 py-20 px-6 relative overflow-hidden">
      <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-primary-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="max-w-7xl mx-auto relative">
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
          <Link href="/" className="inline-flex items-center gap-2 text-surface-500 hover:text-surface-900 dark:hover:text-white mb-12 transition-colors"><ArrowLeft className="w-4 h-4" /> Back to Home</Link>
        </motion.div>
        <div className="max-w-4xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-16">
            <Badge variant="primary" className="mb-4">Contact</Badge>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-surface-900 dark:text-white mb-4 font-['Inter']">Get in <span className="gradient-text">Touch</span></h1>
            <p className="text-lg text-surface-500 dark:text-surface-400 max-w-xl mx-auto">Have questions about DheeTantra? Our team is here to help you build better customer relationships.</p>
          </motion.div>
          <div className="grid md:grid-cols-5 gap-8">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="md:col-span-2 space-y-6">
              <div className="glass rounded-2xl p-6 shadow-glass space-y-6">
                <ContactInfo icon={<Mail className="w-5 h-5" />} title="Email" lines={['support@dheetantra.com', 'sales@dheetantra.com']} />
                <ContactInfo icon={<Phone className="w-5 h-5" />} title="Phone" lines={['+1 (555) 123-4567']} />
                <ContactInfo icon={<MapPin className="w-5 h-5" />} title="Office" lines={['123 Innovation Drive', 'Tech City, TC 94043']} />
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="md:col-span-3">
              {submitted ? (
                <div className="glass rounded-2xl p-10 shadow-glass text-center">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <h3 className="text-xl font-bold text-surface-900 dark:text-surface-100 mb-2">Message Sent!</h3>
                  <p className="text-surface-500 mb-6">Thank you for reaching out. We&rsquo;ll get back to you within 24 hours.</p>
                  <Button variant="secondary" onClick={() => { setSubmitted(false); setFormData({ name: '', email: '', message: '' }); }}>Send Another Message</Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="glass rounded-2xl p-8 shadow-glass space-y-5">
                  <Input label="Full Name" placeholder="John Doe" value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} error={errors.name} icon={<Sprout className="w-4 h-4" />} />
                  <Input label="Email Address" type="email" placeholder="john@company.com" value={formData.email} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} error={errors.email} icon={<Mail className="w-4 h-4" />} />
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-surface-700 dark:text-surface-300">Message</label>
                    <textarea rows={4} value={formData.message} onChange={e => setFormData(p => ({ ...p, message: e.target.value }))}
                      className={`w-full bg-white dark:bg-surface-950 border rounded-xl px-4 py-3 text-sm outline-none transition-all placeholder:text-surface-400 focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 resize-none ${errors.message ? 'border-red-400 dark:border-red-600' : 'border-surface-300 dark:border-surface-700'}`}
                      placeholder="How can we help?" />
                    {errors.message && <p className="text-xs text-red-500 dark:text-red-400">{errors.message}</p>}
                  </div>
                  <Button type="submit" loading={loading} className="w-full"><Send className="w-4 h-4" /> Send Message</Button>
                </form>
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContactInfo({ icon, title, lines }: { icon: React.ReactNode; title: string; lines: string[] }) {
  return (
    <div className="flex items-start gap-4">
      <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 shrink-0">{icon}</div>
      <div>
        <p className="font-semibold text-surface-900 dark:text-surface-100 text-sm">{title}</p>
        {lines.map((line, i) => <p key={i} className="text-surface-500 text-sm">{line}</p>)}
      </div>
    </div>
  );
}
