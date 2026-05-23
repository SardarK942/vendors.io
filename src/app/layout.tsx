import type { Metadata } from 'next';
import { Spectral, Schibsted_Grotesk, DM_Mono } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

// Baazar TY-C typography — DESIGN.md frontmatter typography block.
// v2 swap target is Gambarino + Apparat from Indian Type Foundry once revenue positive.
const spectral = Spectral({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '700', '800'],
  style: ['normal', 'italic'],
  display: 'swap',
});

const schibstedGrotesk = Schibsted_Grotesk({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Baazar — South Asian wedding marketplace · Chicago',
    template: '%s | Baazar',
  },
  description:
    'Discover, compare, and book verified South Asian wedding vendors in Chicago. Editorial curation, transparent pricing, and secure hold deposits.',
  keywords: [
    'baazar',
    'south asian wedding',
    'chicago wedding vendors',
    'desi wedding',
    'indian wedding',
    'mehndi',
    'wedding marketplace',
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${spectral.variable} ${schibstedGrotesk.variable} ${dmMono.variable} antialiased`}
      >
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
