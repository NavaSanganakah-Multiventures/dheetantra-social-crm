'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, MessageSquare, Globe, Shield, Zap, Heart } from 'lucide-react';
import { motion } from 'motion/react';
import { Badge } from '../../components/ui/Badge';
import { useLang, LangSwitcher } from '../../lib/i18n';

export default function AboutPage() {
  const { t } = useLang();
  const values = [
    {
      icon: <Heart className="w-6 h-6" />,
      title: t('about.value1.title'),
      desc: t('about.value1.desc'),
      color: 'from-rose-500 to-pink-600',
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: t('about.value2.title'),
      desc: t('about.value2.desc'),
      color: 'from-amber-500 to-orange-600',
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: t('about.value3.title'),
      desc: t('about.value3.desc'),
      color: 'from-blue-500 to-cyan-600',
    },
    {
      icon: <Globe className="w-6 h-6" />,
      title: t('about.value4.title'),
      desc: t('about.value4.desc'),
      color: 'from-emerald-500 to-teal-600',
    },
  ];

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950 py-20 px-6 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-primary-500/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-5xl mx-auto">
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
          <div className="flex items-center justify-between mb-12">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-surface-500 hover:text-surface-900 dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> {t('back.toHome')}
            </Link>
            <LangSwitcher />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <Badge variant="primary" className="mb-4">
            {t('about.badge')}
          </Badge>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-surface-900 dark:text-white mb-4 font-['Inter']">
            {t('about.title1')} <span className="gradient-text">DheeTantra</span>
          </h1>
          <p className="text-lg text-surface-500 dark:text-surface-400 max-w-2xl mx-auto leading-relaxed">
            {t('about.intro')}
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8 mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass rounded-2xl p-8 md:p-10 shadow-glass"
          >
            <h2 className="text-2xl font-bold mb-4 font-['Inter'] text-surface-900 dark:text-surface-100">
              {t('about.missionTitle')}
            </h2>
            <p className="text-surface-600 dark:text-surface-400 leading-relaxed">
              {t('about.missionText')}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="glass rounded-2xl p-8 md:p-10 shadow-glass"
          >
            <h2 className="text-2xl font-bold mb-4 font-['Inter'] text-surface-900 dark:text-surface-100">
              {t('about.edgeTitle')}
            </h2>
            <p className="text-surface-600 dark:text-surface-400 leading-relaxed">
              {t('about.edgeText')}
            </p>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <Badge variant="primary" className="mb-4">
            {t('about.valuesBadge')}
          </Badge>
          <h2 className="text-3xl font-extrabold font-['Inter'] tracking-tight text-surface-900 dark:text-white">
            {t('about.valuesTitle')}
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-4 gap-6">
          {values.map((v, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-2xl p-6 hover:shadow-card-hover transition-all"
            >
              <div
                className={`w-12 h-12 rounded-xl bg-gradient-to-br ${v.color} flex items-center justify-center text-white mb-4 shadow-lg`}
              >
                {v.icon}
              </div>
              <h3 className="font-bold text-surface-900 dark:text-surface-100 mb-2">
                {v.title}
              </h3>
              <p className="text-sm text-surface-500 dark:text-surface-400 leading-relaxed">
                {v.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
