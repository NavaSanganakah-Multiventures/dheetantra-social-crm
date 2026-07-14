'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Sprout, Globe, Shield, Zap, Heart } from 'lucide-react';
import { motion } from 'motion/react';
import { Badge } from '../../components/ui/Badge';

const values = [
  { icon: <Heart className="w-6 h-6" />, title: 'Customer First', desc: 'Every feature we build starts with a real customer problem.', color: 'from-rose-500 to-pink-600' },
  { icon: <Zap className="w-6 h-6" />, title: 'Edge Performance', desc: 'Built on Cloudflare Workers for global 0ms latency at scale.', color: 'from-amber-500 to-orange-600' },
  { icon: <Shield className="w-6 h-6" />, title: 'Trust & Security', desc: 'Enterprise-grade encryption and compliance for your data.', color: 'from-primary-500 to-emerald-600' },
  { icon: <Globe className="w-6 h-6" />, title: 'Regional Focus', desc: 'Built for Indian businesses with Hindi-first interface and local support.', color: 'from-emerald-500 to-teal-600' },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950 py-20 px-6 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-primary-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="max-w-5xl mx-auto">
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
          <Link href="/" className="inline-flex items-center gap-2 text-surface-500 hover:text-surface-900 dark:hover:text-white mb-12 transition-colors"><ArrowLeft className="w-4 h-4" /> Back to Home</Link>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-16">
          <Badge variant="primary" className="mb-4">About</Badge>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-surface-900 dark:text-white mb-4 font-['Inter']">About <span className="gradient-text">DheeTantra</span></h1>
          <p className="text-lg text-surface-500 dark:text-surface-400 max-w-2xl mx-auto leading-relaxed">We are building the next generation of customer communication tools. DheeTantra empowers businesses to connect with their audience seamlessly across all platforms.</p>
        </motion.div>
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-2xl p-8 md:p-10 shadow-glass">
            <h2 className="text-2xl font-bold mb-4 font-['Inter'] text-surface-900 dark:text-surface-100">Our Mission</h2>
            <p className="text-surface-600 dark:text-surface-400 leading-relaxed">In a world where customers expect instant, personalized responses on their preferred channels, businesses often struggle with fragmented inboxes and disconnected tools. Our mission is to unify these channels&mdash;WhatsApp, Email, Instagram, and more&mdash;into a single, blazing-fast workspace built on edge infrastructure.</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass rounded-2xl p-8 md:p-10 shadow-glass">
            <h2 className="text-2xl font-bold mb-4 font-['Inter'] text-surface-900 dark:text-surface-100">Why Cloudflare Edge?</h2>
            <p className="text-surface-600 dark:text-surface-400 leading-relaxed">DheeTantra is proudly built on Cloudflare Workers. This means our platform operates at the edge of the network, within milliseconds of your users, providing unparalleled speed, reliability, and security.</p>
          </motion.div>
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
          <Badge variant="primary" className="mb-4">Values</Badge>
          <h2 className="text-3xl font-extrabold font-['Inter'] tracking-tight text-surface-900 dark:text-white">What drives us</h2>
        </motion.div>
        <div className="grid md:grid-cols-4 gap-6">
          {values.map((v, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
              className="bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-2xl p-6 hover:shadow-card-hover transition-all">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${v.color} flex items-center justify-center text-white mb-4 shadow-lg`}>{v.icon}</div>
              <h3 className="font-bold text-surface-900 dark:text-surface-100 mb-2">{v.title}</h3>
              <p className="text-sm text-surface-500 dark:text-surface-400 leading-relaxed">{v.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
