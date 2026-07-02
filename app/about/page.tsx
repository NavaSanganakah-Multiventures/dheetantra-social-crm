import React from 'react';
import Link from 'next/link';
import { ArrowLeft, MessageSquare } from 'lucide-react';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans selection:bg-indigo-500/30 py-20 px-6">
      <div className="max-w-4xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white mb-12 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
        
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600 mb-6 shadow-lg shadow-indigo-500/20">
            <MessageSquare className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-zinc-900 dark:text-white mb-6 font-display">About DheeTantra</h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            We are building the next generation of customer communication tools. DheeTantra empowers businesses to connect with their audience seamlessly across all platforms.
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 md:p-12 shadow-sm mb-12">
          <h2 className="text-2xl font-bold mb-4 font-display">Our Mission</h2>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mb-8">
            In a world where customers expect instant, personalized responses on their preferred channels, businesses often struggle with fragmented inboxes and disconnected tools. Our mission is to unify these channels—WhatsApp, Email, Instagram, and more—into a single, blazing-fast workspace built on edge infrastructure.
          </p>
          
          <h2 className="text-2xl font-bold mb-4 font-display">Why Cloudflare Edge?</h2>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
            DheeTantra is proudly built on Cloudflare Workers. This means our platform operates at the edge of the network, within milliseconds of your users, providing unparalleled speed, reliability, and security.
          </p>
        </div>
      </div>
    </div>
  );
}
