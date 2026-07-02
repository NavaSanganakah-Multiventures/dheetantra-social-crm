import React from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Terms & Conditions | DheeTantra',
  description: 'Read the DheeTantra Terms and Conditions. Understand the rules and guidelines for using our services.',
};

export default function TermsConditionsPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans selection:bg-indigo-500/30">
      <div className="max-w-4xl mx-auto px-6 py-20">
        <Link href="/" className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-medium mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
        <h1 className="text-4xl md:text-5xl font-bold font-display text-zinc-900 dark:text-white mb-8">Terms & Conditions</h1>
        
        <div className="space-y-8 text-zinc-600 dark:text-zinc-400 leading-relaxed">
          <p className="text-sm font-medium">Last updated: {new Date().toLocaleDateString()}</p>
          
          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-display text-zinc-900 dark:text-white">1. Acceptance of Terms</h2>
            <p>By accessing and using DheeTantra, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by these terms, please do not use our service.</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-display text-zinc-900 dark:text-white">2. Description of Service</h2>
            <p>DheeTantra provides an omnichannel CRM platform integrating various communication channels (such as WhatsApp, Email, and Social Media) through Cloudflare infrastructure. We reserve the right to modify or discontinue the service with or without notice.</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-display text-zinc-900 dark:text-white">3. User Account Responsibilities</h2>
            <p>To use certain features, you must register for an account. You are responsible for maintaining the confidentiality of your account information, including your password, and for all activity that occurs under your account. You agree to notify us immediately of any unauthorized use of your account.</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-display text-zinc-900 dark:text-white">4. Acceptable Use Policy</h2>
            <p>You agree not to use the Service to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Upload, post, or transmit any content that is unlawful, harmful, threatening, abusive, harassing, or otherwise objectionable.</li>
              <li>Violate any applicable local, state, national, or international laws, including Meta/WhatsApp business policies.</li>
              <li>Interfere with or disrupt the services or servers or networks connected to the service.</li>
              <li>Send spam, bulk unsolicited messages, or unauthorized broadcasts.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-display text-zinc-900 dark:text-white">5. Limitation of Liability</h2>
            <p>In no event shall DheeTantra, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the Service.</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-display text-zinc-900 dark:text-white">6. Modifications to Terms</h2>
            <p>We reserve the right, at our sole discretion, to modify or replace these Terms at any time. What constitutes a material change will be determined at our sole discretion. By continuing to access or use our Service after those revisions become effective, you agree to be bound by the revised terms.</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-display text-zinc-900 dark:text-white">7. Contact Information</h2>
            <p>If you have any questions about these Terms, please contact us at <a href="mailto:support@dheetantra.com" className="text-indigo-600 dark:text-indigo-400 hover:underline">support@dheetantra.com</a>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
