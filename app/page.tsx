'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, useScroll, useTransform } from 'motion/react';
import {
  ArrowRight,
  MessageSquare,
  Megaphone,
  Zap,
  Shield,
  BarChart3,
  Globe,
  Menu,
  X,
  Check,
  Star,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useLang, LangSwitcher } from '../lib/i18n';

function useScrollProgress() {
  const { scrollY } = useScroll();
  const navBg = useTransform(
    scrollY,
    [0, 80],
    ['rgba(255,255,255,0)', 'rgba(255,255,255,0.85)']
  );
  const navBorder = useTransform(
    scrollY,
    [0, 80],
    ['rgba(0,0,0,0)', 'rgba(0,0,0,0.08)']
  );
  return { navBg, navBorder };
}

export default function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { navBg, navBorder } = useScrollProgress();

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950 overflow-hidden">
      <NavBar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} navBg={navBg} navBorder={navBorder} />

      <HeroSection />
      <BrandStrip />
      <FeaturesSection />
      <StatsSection />
      <TestimonialsSection />
      <PricingPreviewSection />
      <CTASection />
      <FooterSection />

      {mobileOpen && <MobileMenu onClose={() => setMobileOpen(false)} />}
    </div>
  );
}

function NavBar({
  mobileOpen,
  setMobileOpen,
  navBg,
  navBorder,
}: {
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
  navBg: any;
  navBorder: any;
}) {
  const { t } = useLang();
  return (
    <motion.nav
      style={{ background: navBg, borderBottomColor: navBorder }}
      className="fixed w-full z-50 top-0 border-b backdrop-blur-lg"
    >
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/20">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-2xl tracking-tight font-['Inter']">
            Dhee<span className="gradient-text">Tantra</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-surface-600 dark:text-surface-300">
          <NavLink href="#features">{t('nav.features')}</NavLink>
          <NavLink href="/pricing">{t('nav.pricing')}</NavLink>
          <NavLink href="/about">{t('nav.about')}</NavLink>
          <NavLink href="/contact">{t('nav.contact')}</NavLink>
        </div>

        <div className="hidden md:flex items-center gap-4">
          <LangSwitcher />
          <Link
            href="/login"
            className="text-sm font-medium text-surface-600 dark:text-surface-300 hover:text-surface-900 dark:hover:text-white transition-colors"
          >
            {t('nav.login')}
          </Link>
          <Button as={Link} href="/register" size="sm">
            {t('nav.getStarted')} <ArrowRight className="w-4 h-4" />
          </Button>
        </div>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-600 dark:text-surface-300"
        >
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>
    </motion.nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="relative after:absolute after:bottom-[-4px] after:left-0 after:h-[2px] after:w-0 after:bg-primary-500 after:transition-all hover:after:w-full"
    >
      {children}
    </Link>
  );
}

function HeroSection() {
  const { t } = useLang();
  return (
    <section className="relative min-h-screen flex items-center pt-20 pb-20 overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-primary-500/5 dark:bg-primary-500/10 rounded-full blur-[120px] animate-orb" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-cyan-500/5 dark:bg-cyan-500/10 rounded-full blur-[100px] animate-float-delayed" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br from-primary-500/3 to-cyan-500/3 rounded-full blur-[150px]" />
        <div className="absolute top-20 left-10 w-4 h-4 bg-primary-400/20 rounded-full animate-float" />
        <div className="absolute top-40 right-20 w-6 h-6 bg-cyan-400/20 rounded-full animate-float-delayed" />
        <div className="absolute bottom-40 left-1/3 w-3 h-3 bg-amber-400/20 rounded-full animate-float" />
      </div>

      <div className="max-w-7xl mx-auto px-6 relative z-10 w-full">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <Badge variant="primary" size="md" className="mb-6">
                <span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse-soft" />
                {t('home.badge')}
              </Badge>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-5xl md:text-7xl font-extrabold tracking-tight text-surface-900 dark:text-white mb-6 leading-[1.05] font-['Inter']"
            >
              {t('home.hero.title1')}{' '}
              <span className="gradient-text">{t('home.hero.title2')}</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-lg md:text-xl text-surface-500 dark:text-surface-400 mb-10 max-w-xl leading-relaxed"
            >
              {t('home.hero.subtitle')}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-4"
            >
              <Button size="lg" as={Link} href="/register">
                {t('home.hero.startFree')} <ArrowRight className="w-5 h-5" />
              </Button>
              <Button variant="glass" size="lg" as={Link} href="/contact">
                {t('home.hero.bookDemo')}
              </Button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="flex items-center gap-6 mt-10 text-sm text-surface-500"
            >
              <span className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-500" /> {t('home.hero.noCreditCard')}
              </span>
              <span className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-500" /> {t('home.hero.freeWorkspace')}
              </span>
              <span className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-500" /> {t('home.hero.cancelAnytime')}
              </span>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="hidden lg:block"
          >
            <div className="relative">
              <div className="glass rounded-3xl p-8 shadow-glass-lg">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 pb-4 border-b border-surface-200 dark:border-surface-700/50">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-amber-400" />
                    <div className="w-3 h-3 rounded-full bg-emerald-400" />
                    <span className="text-xs text-surface-400 ml-2 font-medium">
                      dheetantra.com/inbox
                    </span>
                  </div>
                  {[
                    {
                      name: 'Priya Sharma',
                      msg: t('home.mock.msg1'),
                      time: t('home.mock.time1'),
                      active: true,
                    },
                    {
                      name: 'Rajesh Kumar',
                      msg: t('home.mock.msg2'),
                      time: t('home.mock.time2'),
                      active: false,
                    },
                    {
                      name: 'Anita Patel',
                      msg: t('home.mock.msg3'),
                      time: t('home.mock.time3'),
                      active: false,
                    },
                  ].map((item, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-3 p-3 rounded-xl transition-colors ${
                        item.active
                          ? 'bg-primary-50 dark:bg-primary-500/10 border border-primary-100 dark:border-primary-500/20'
                          : 'hover:bg-surface-50 dark:hover:bg-surface-800/50'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-400 to-cyan-400 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {item.name
                          .split(' ')
                          .map(n => n[0])
                          .join('')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-surface-900 dark:text-surface-100">
                            {item.name}
                          </span>
                          <span className="text-xs text-surface-400">{item.time}</span>
                        </div>
                        <p className="text-sm text-surface-500 truncate">{item.msg}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-surface-200 dark:border-surface-700/50">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-10 rounded-xl bg-surface-100 dark:bg-surface-800 flex items-center px-4">
                      <span className="text-sm text-surface-400">{t('home.mock.type')}</span>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center">
                      <ArrowRight className="w-4 h-4 text-white" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -top-6 -right-6 w-24 h-24 bg-gradient-to-br from-primary-500/20 to-cyan-500/20 rounded-full blur-2xl animate-float" />
              <div className="absolute -bottom-4 -left-4 w-16 h-16 bg-amber-500/10 rounded-full blur-xl animate-float-delayed" />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function BrandStrip() {
  const { t } = useLang();
  return (
    <section className="py-12 border-y border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900/50">
      <div className="max-w-7xl mx-auto px-6">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-surface-400 mb-8">
          {t('home.trustedBy')}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-16 gap-y-6 opacity-40 dark:opacity-30">
          {['Cloudflare', 'Meta', 'Google', 'AWS', 'Stripe', 'Twilio'].map(name => (
            <span key={name} className="text-xl font-bold text-surface-600 dark:text-surface-400">
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  const { t } = useLang();
  const features = [
    {
      icon: <MessageSquare className="w-6 h-6" />,
      title: t('home.features.inbox.title'),
      description: t('home.features.inbox.desc'),
      color: 'from-primary-500 to-indigo-600',
    },
    {
      icon: <Megaphone className="w-6 h-6" />,
      title: t('home.features.broadcast.title'),
      description: t('home.features.broadcast.desc'),
      color: 'from-emerald-500 to-teal-600',
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: t('home.features.edge.title'),
      description: t('home.features.edge.desc'),
      color: 'from-amber-500 to-orange-600',
    },
    {
      icon: <Globe className="w-6 h-6" />,
      title: t('home.features.email.title'),
      description: t('home.features.email.desc'),
      color: 'from-blue-500 to-cyan-600',
    },
    {
      icon: <BarChart3 className="w-6 h-6" />,
      title: t('home.features.analytics.title'),
      description: t('home.features.analytics.desc'),
      color: 'from-purple-500 to-pink-600',
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: t('home.features.security.title'),
      description: t('home.features.security.desc'),
      color: 'from-rose-500 to-red-600',
    },
  ];

  return (
    <section id="features" className="py-24 relative">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          className="text-center mb-20"
        >
          <Badge variant="primary" className="mb-4">
            {t('home.features.badge')}
          </Badge>
          <h2 className="text-4xl md:text-5xl font-extrabold mb-4 font-['Inter'] tracking-tight">
            {t('home.features.title1')}{' '}
            <span className="gradient-text">{t('home.features.title2')}</span>
          </h2>
          <p className="text-surface-500 dark:text-surface-400 max-w-2xl mx-auto text-lg">
            {t('home.features.subtitle')}
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ delay: i * 0.08 }}
              className="group relative bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 p-8 rounded-2xl hover:shadow-card-hover transition-all hover:-translate-y-1"
            >
              <div
                className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-6 text-white shadow-lg`}
              >
                {feature.icon}
              </div>
              <h3 className="text-lg font-bold mb-3 font-['Inter'] text-surface-900 dark:text-surface-100">
                {feature.title}
              </h3>
              <p className="text-surface-500 dark:text-surface-400 leading-relaxed text-sm">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatsSection() {
  const { t } = useLang();
  const stats = [
    { value: '10K+', label: t('home.stats.workspaces') },
    { value: '1M+', label: t('home.stats.messages') },
    { value: '99.9%', label: t('home.stats.uptime') },
    { value: '150+', label: t('home.stats.countries') },
  ];

  return (
    <section className="py-24 bg-surface-900 dark:bg-surface-950 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-primary-500/5 to-transparent pointer-events-none" />
      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="text-center"
            >
              <div className="text-4xl md:text-5xl font-extrabold text-white mb-2 font-['Inter']">
                {stat.value}
              </div>
              <div className="text-surface-400 text-sm">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TestimonialsSection() {
  const { t } = useLang();
  const testimonials = [
    {
      quote: t('home.testimonials.quote1'),
      name: 'Vikram Mehta',
      role: t('home.testimonials.role1'),
      rating: 5,
    },
    {
      quote: t('home.testimonials.quote2'),
      name: 'Neha Gupta',
      role: t('home.testimonials.role2'),
      rating: 5,
    },
    {
      quote: t('home.testimonials.quote3'),
      name: 'Arun Singh',
      role: t('home.testimonials.role3'),
      rating: 5,
    },
  ];

  return (
    <section className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <Badge variant="primary" className="mb-4">
            {t('home.testimonials.badge')}
          </Badge>
          <h2 className="text-4xl font-extrabold mb-4 font-['Inter'] tracking-tight">
            {t('home.testimonials.title1')}{' '}
            <span className="gradient-text">{t('home.testimonials.title2')}</span>
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((t, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="glass rounded-2xl p-8 shadow-glass"
            >
              <div className="flex gap-1 mb-4">
                {Array.from({ length: t.rating }).map((_, j) => (
                  <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-surface-600 dark:text-surface-400 leading-relaxed mb-6 text-sm">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-cyan-400 flex items-center justify-center text-white text-sm font-bold">
                  {t.name
                    .split(' ')
                    .map(n => n[0])
                    .join('')}
                </div>
                <div>
                  <p className="text-sm font-semibold text-surface-900 dark:text-surface-100">
                    {t.name}
                  </p>
                  <p className="text-xs text-surface-500">{t.role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingPreviewSection() {
  const { t } = useLang();
  return (
    <section className="py-24 bg-surface-100 dark:bg-surface-900/50">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <Badge variant="primary" className="mb-4">
            {t('home.pricing.badge')}
          </Badge>
          <h2 className="text-4xl font-extrabold mb-4 font-['Inter'] tracking-tight">
            {t('home.pricing.title1')}{' '}
            <span className="gradient-text">{t('home.pricing.title2')}</span>
          </h2>
          <p className="text-surface-500 max-w-xl mx-auto">
            {t('home.pricing.subtitle')}
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {[
            {
              name: 'Starter',
              price: 'Free',
              desc: t('home.pricing.starter.desc'),
              features: [
                t('home.pricing.starter.f1'),
                t('home.pricing.starter.f2'),
                t('home.pricing.starter.f3'),
                t('home.pricing.starter.f4'),
              ],
            },
            {
              name: 'Business',
              price: '$29',
              desc: t('home.pricing.business.desc'),
              popular: true,
              features: [
                t('home.pricing.business.f1'),
                t('home.pricing.business.f2'),
                t('home.pricing.business.f3'),
                t('home.pricing.business.f4'),
                t('home.pricing.business.f5'),
              ],
            },
            {
              name: 'Enterprise',
              price: '$99',
              desc: t('home.pricing.enterprise.desc'),
              features: [
                t('home.pricing.enterprise.f1'),
                t('home.pricing.enterprise.f2'),
                t('home.pricing.enterprise.f3'),
                t('home.pricing.enterprise.f4'),
                t('home.pricing.enterprise.f5'),
              ],
            },
          ].map((plan, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={`relative rounded-2xl p-8 border transition-all ${
                plan.popular
                  ? 'bg-surface-900 dark:bg-surface-800 border-primary-500 shadow-2xl shadow-primary-500/10 scale-105'
                  : 'bg-white dark:bg-surface-900 border-surface-200 dark:border-surface-800 hover:shadow-card-hover'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge variant="primary" size="md">
                    {t('home.pricing.mostPopular')}
                  </Badge>
                </div>
              )}
              <h3
                className={`text-lg font-bold mb-1 font-['Inter'] ${plan.popular ? 'text-white' : 'text-surface-900 dark:text-surface-100'}`}
              >
                {plan.name}
              </h3>
              <p className={`text-sm mb-4 ${plan.popular ? 'text-surface-400' : 'text-surface-500'}`}>
                {plan.desc}
              </p>
              <div className="mb-6">
                <span
                  className={`text-4xl font-extrabold font-['Inter'] ${plan.popular ? 'text-white' : 'text-surface-900 dark:text-surface-100'}`}
                >
                  {plan.price}
                </span>
                {plan.price !== 'Free' && (
                  <span className={`text-sm ml-1 ${plan.popular ? 'text-surface-400' : 'text-surface-500'}`}>
                    {t('home.pricing.perMonth')}
                  </span>
                )}
              </div>
              <ul className="space-y-3 mb-8">
                {plan.features.map((f, j) => (
                  <li
                    key={j}
                    className={`flex items-center gap-2 text-sm ${plan.popular ? 'text-surface-300' : 'text-surface-600 dark:text-surface-400'}`}
                  >
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/register"
                className={`block w-full text-center font-medium rounded-xl py-3 transition-all text-sm ${
                  plan.popular
                    ? 'bg-primary-600 text-white hover:bg-primary-700'
                    : 'bg-surface-100 dark:bg-surface-800 text-surface-900 dark:text-surface-100 hover:bg-surface-200 dark:hover:bg-surface-700'
                }`}
              >
                {t('home.pricing.getStarted')}
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  const { t } = useLang();
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary-600 via-primary-700 to-cyan-700" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.1),transparent_70%)]" />
      <div className="max-w-4xl mx-auto px-6 relative z-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-4xl md:text-6xl font-extrabold text-white mb-6 font-['Inter'] leading-tight">
            {t('home.cta.title1')}{' '}
            <span className="text-cyan-300">{t('home.cta.title2')}</span>
          </h2>
          <p className="text-white/70 mb-10 max-w-xl mx-auto text-lg">
            {t('home.cta.subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 bg-white text-surface-900 px-8 py-4 rounded-xl font-semibold text-lg hover:bg-white/90 hover:shadow-2xl transition-all"
            >
              {t('home.cta.createWorkspace')} <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 bg-white/10 text-white border border-white/20 px-8 py-4 rounded-xl font-medium text-lg hover:bg-white/20 transition-all"
            >
              {t('home.cta.talkToSales')}
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function FooterSection() {
  const { t } = useLang();
  return (
    <footer className="border-t border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-950 py-16">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid md:grid-cols-4 gap-12 mb-12">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
                <MessageSquare className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-lg font-['Inter']">DheeTantra</span>
            </div>
            <p className="text-sm text-surface-500 leading-relaxed">
              {t('home.footer.tagline')}
            </p>
          </div>
          {[
            {
              title: t('home.footer.product'),
              links: [
                { key: 'features', href: '/#features' },
                { key: 'pricing', href: '/pricing' },
                { key: 'integrations', href: '/integrations' },
                { key: 'changelog', href: '/changelog' },
              ],
            },
            {
              title: t('home.footer.company'),
              links: [
                { key: 'about', href: '/about' },
                { key: 'blog', href: '/blog' },
                { key: 'careers', href: '/careers' },
                { key: 'contact', href: '/contact' },
              ],
            },
            {
              title: t('home.footer.legal'),
              links: [
                { key: 'privacy', href: '/privacy-policy' },
                { key: 'terms', href: '/terms-conditions' },
                { key: 'dataDeletion', href: '/data-deletion-status' },
              ],
            },
          ].map((col, i) => (
            <div key={i}>
              <h4 className="text-sm font-semibold text-surface-900 dark:text-surface-100 mb-4 uppercase tracking-wider">
                {col.title}
              </h4>
              <ul className="space-y-3">
                {col.links.map((link, j) => (
                  <li key={j}>
                    <Link
                      href={link.href}
                      className="text-sm text-surface-500 hover:text-surface-900 dark:hover:text-surface-100 transition-colors"
                    >
                      {t(`home.footer.${link.key}`)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="pt-8 border-t border-surface-200 dark:border-surface-800 text-center text-sm text-surface-400">
          &copy; {new Date().getFullYear()} DheeTantra Inc. {t('home.footer.rights')}
        </div>
      </div>
    </footer>
  );
}

function MobileMenu({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 bg-white dark:bg-surface-950 pt-20"
    >
      <div className="flex flex-col items-center gap-6 p-8 text-lg font-medium">
        <Link href="#features" onClick={onClose} className="hover:text-primary-600 transition-colors">
          {t('nav.features')}
        </Link>
        <Link href="/pricing" onClick={onClose} className="hover:text-primary-600 transition-colors">
          {t('nav.pricing')}
        </Link>
        <Link href="/about" onClick={onClose} className="hover:text-primary-600 transition-colors">
          {t('nav.about')}
        </Link>
        <Link href="/contact" onClick={onClose} className="hover:text-primary-600 transition-colors">
          {t('nav.contact')}
        </Link>
        <LangSwitcher />
        <div className="flex flex-col gap-3 w-full max-w-xs mt-4">
          <Link
            href="/login"
            className="w-full text-center py-3 rounded-xl border border-surface-300 dark:border-surface-700 font-medium"
          >
            {t('nav.login')}
          </Link>
          <Link
            href="/register"
            className="w-full text-center py-3 rounded-xl bg-primary-600 text-white font-medium"
          >
            {t('nav.getStarted')}
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
