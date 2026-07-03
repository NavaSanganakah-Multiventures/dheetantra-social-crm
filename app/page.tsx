"use client";

import React from 'react';
import Link from 'next/link';
import { ArrowRight, MessageSquare, Megaphone, Zap, Shield, BarChart3, Globe } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans selection:bg-indigo-500/30">
      {/* Navigation */}
      <nav className="fixed w-full z-50 top-0 transition-all duration-300 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-2xl tracking-tight font-display">DheeTantra</span>
          </div>
          
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-600 dark:text-zinc-300">
            <Link href="#features" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Features</Link>
            <Link href="/about" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">About Us</Link>
            <Link href="/pricing" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Pricing</Link>
            <Link href="/contact" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Contact</Link>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors">
              Log In
            </Link>
            <Link href="/register" className="text-sm font-medium bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-5 py-2.5 rounded-full hover:scale-105 transition-transform shadow-lg">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-20 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full blur-[100px] pointer-events-none"></div>
        
        <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-sm font-medium mb-8">
            <span className="flex h-2 w-2 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-pulse"></span>
            Next-Gen Omnichannel CRM
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-zinc-900 dark:text-white mb-8 font-display max-w-4xl mx-auto leading-tight">
            Unify Your Customer <br className="hidden md:block"/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-cyan-500">Communications</span>
          </h1>
          
          <p className="text-lg md:text-xl text-zinc-600 dark:text-zinc-400 mb-12 max-w-2xl mx-auto leading-relaxed">
            DheeTantra seamlessly connects WhatsApp, Emails, and Social Media into one powerful, lightning-fast dashboard powered by Cloudflare.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register" className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 text-white px-8 py-4 rounded-full font-medium text-lg hover:bg-indigo-700 hover:shadow-xl hover:shadow-indigo-500/30 transition-all">
              Start for Free <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/contact" className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-800 px-8 py-4 rounded-full font-medium text-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all">
              Book a Demo
            </Link>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 bg-white dark:bg-zinc-900">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 font-display">Everything you need to scale</h2>
            <p className="text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto">Powerful features designed to help your team respond faster, automate workflows, and close more deals.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<MessageSquare className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />}
              title="Unified Inbox"
              description="Manage WhatsApp, Facebook Messenger, and Instagram DMs from a single, collaborative dashboard."
            />
            <FeatureCard 
              icon={<Megaphone className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />}
              title="Smart Broadcasts"
              description="Send personalized WhatsApp campaigns to thousands of contacts with automated rate limiting."
            />
            <FeatureCard 
              icon={<Zap className="w-6 h-6 text-amber-600 dark:text-amber-400" />}
              title="Edge Infrastructure"
              description="Built on Cloudflare Workers for global 0ms latency. Fast, secure, and incredibly reliable."
            />
            <FeatureCard 
              icon={<Globe className="w-6 h-6 text-blue-600 dark:text-blue-400" />}
              title="Email Routing"
              description="Connect your domain and route customer emails directly into your DheeTantra workspace."
            />
            <FeatureCard 
              icon={<BarChart3 className="w-6 h-6 text-purple-600 dark:text-purple-400" />}
              title="Actionable Analytics"
              description="Track response times, campaign ROI, and team performance with beautiful visual reports."
            />
            <FeatureCard 
              icon={<Shield className="w-6 h-6 text-rose-600 dark:text-rose-400" />}
              title="Enterprise Security"
              description="Role-based access control, end-to-end encryption for API keys, and compliance ready."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-6 relative z-10">
          <div className="bg-zinc-900 dark:bg-zinc-800 rounded-3xl p-12 text-center border border-zinc-800 dark:border-zinc-700 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-500/20 to-transparent pointer-events-none"></div>
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 font-display">Ready to transform your communication?</h2>
            <p className="text-zinc-400 mb-10 max-w-xl mx-auto text-lg">Join forward-thinking businesses using DheeTantra to build better customer relationships.</p>
            <Link href="/register" className="inline-flex items-center justify-center gap-2 bg-indigo-600 text-white px-8 py-4 rounded-full font-medium text-lg hover:bg-indigo-500 hover:shadow-xl hover:shadow-indigo-500/30 transition-all">
              Create Your Free Workspace
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 dark:bg-white flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-white dark:text-zinc-900" />
            </div>
            <span className="font-bold text-lg font-display">DheeTantra</span>
          </div>
          <div className="flex gap-6 text-sm font-medium text-zinc-500">
            <Link href="/privacy-policy" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Privacy Policy</Link>
            <Link href="/terms-conditions" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Terms & Conditions</Link>
          </div>
          <div className="text-zinc-500 text-sm">
            © {new Date().getFullYear()} DheeTantra Inc. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-8 rounded-2xl hover:shadow-lg transition-shadow">
      <div className="w-12 h-12 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-center mb-6 shadow-sm">
        {icon}
      </div>
      <h3 className="text-xl font-semibold mb-3 font-display">{title}</h3>
      <p className="text-zinc-500 dark:text-zinc-400 leading-relaxed">{description}</p>
    </div>
  );
}
