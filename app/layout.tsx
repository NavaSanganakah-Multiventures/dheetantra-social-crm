import type {Metadata} from 'next';
import './globals.css';
import { FcmRegistration } from '../components/FcmRegistration';

export const metadata: Metadata = {
  title: 'DheeTantra | Ultimate Omnichannel SaaS & WhatsApp CRM',
  description: 'DheeTantra connects WhatsApp, Emails, and Social Media into a single powerful omnichannel dashboard. Scale your customer engagement effortlessly.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="hi" suppressHydrationWarning className="antialiased">
      <body className="font-sans min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 flex flex-col" suppressHydrationWarning>
        <FcmRegistration />
        {children}
      </body>
    </html>
  );
}

