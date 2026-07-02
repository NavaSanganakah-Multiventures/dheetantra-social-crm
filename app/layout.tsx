import type {Metadata} from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'DheeTantra | Ultimate Omnichannel SaaS & WhatsApp CRM',
  description: 'DheeTantra connects WhatsApp, Emails, and Social Media into a single powerful omnichannel dashboard. Scale your customer engagement effortlessly.',
  keywords: 'DheeTantra, CRM, Omnichannel SaaS, WhatsApp Marketing, Email Routing, Cloudflare SaaS',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="hi" suppressHydrationWarning className={`${inter.variable} ${spaceGrotesk.variable} antialiased`}>
      <body className="font-sans min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 flex flex-col" suppressHydrationWarning>
        {children}
        <script src="https://connect.facebook.net/en_US/sdk.js" crossOrigin="anonymous" async defer></script>
      </body>
    </html>
  );
}

