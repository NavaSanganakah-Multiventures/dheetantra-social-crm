import React from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy Policy | DheeTantra',
  description: 'Read the DheeTantra Privacy Policy. Learn how we collect, use, and protect your data.',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950 font-sans selection:bg-primary-500/30">
      <div className="max-w-4xl mx-auto px-6 py-20">
        <Link href="/" className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
        <h1 className="text-4xl md:text-5xl font-bold font-display text-surface-900 dark:text-white mb-8">Privacy Policy</h1>
        
        <div className="space-y-8 text-surface-600 dark:text-surface-400 leading-relaxed">
          <p className="text-sm font-medium">Last updated: {new Date().toLocaleDateString()}</p>
          
          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-display text-surface-900 dark:text-white">1. Information We Collect</h2>
            <p>At DheeTantra, we collect information to provide better services to all our users. This includes:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Information you provide to us directly (e.g., account registration, contact forms).</li>
              <li>Information collected automatically through your use of our services (e.g., usage data, cookies).</li>
              <li>Data processed on your behalf while using our omnichannel CRM.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-display text-surface-900 dark:text-white">2. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide, maintain, and improve our services.</li>
              <li>Process transactions and send related information.</li>
              <li>Send technical notices, updates, security alerts, and support messages.</li>
              <li>Respond to your comments, questions, and requests.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-display text-surface-900 dark:text-white">3. Data Security and Cloudflare</h2>
            <p>DheeTantra utilizes Cloudflare&apos;s secure edge infrastructure. Your data is protected by enterprise-grade security, including end-to-end encryption for API keys and secure data routing. We prioritize the security of your personal and business data.</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-display text-surface-900 dark:text-white">4. Data Sharing and Disclosure</h2>
            <p>We do not share personal information with companies, organizations, or individuals outside of DheeTantra except in the following cases:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>With your consent.</li>
              <li>For legal reasons, to meet any applicable law, regulation, legal process, or enforceable governmental request.</li>
              <li>To enforce applicable Terms of Service, including investigation of potential violations.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-display text-surface-900 dark:text-white">5. Your Privacy Rights</h2>
            <p>Depending on your location, you may have rights regarding your personal data, including the right to access, correct, or delete your information. Please contact us to exercise these rights.</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-display text-surface-900 dark:text-white">6. Contact Us</h2>
            <p>If you have any questions about this Privacy Policy, please contact us at <a href="mailto:support@dheetantra.com" className="text-primary-600 dark:text-primary-400 hover:underline">support@dheetantra.com</a>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
