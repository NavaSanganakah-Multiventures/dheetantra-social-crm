import type { Metadata } from 'next';
import './globals.css';
import { FcmRegistration } from '../components/FcmRegistration';
import { ToastProvider } from '../components/ui/Toast';
import { LanguageProvider } from '../lib/i18n';

export const metadata: Metadata = {
  title: 'DheeTantra | Ultimate Omnichannel SaaS & WhatsApp CRM',
  description:
    'DheeTantra connects WhatsApp, Emails, and Social Media into a single powerful omnichannel dashboard. Scale your customer engagement effortlessly.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hi" suppressHydrationWarning className="antialiased">

      <body className="min-h-screen bg-surface-50 dark:bg-surface-950 text-surface-900 dark:text-surface-50 flex flex-col font-sans selection:bg-primary-500/20">
        <FcmRegistration />
        <LanguageProvider>
          <ToastProvider>{children}</ToastProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
