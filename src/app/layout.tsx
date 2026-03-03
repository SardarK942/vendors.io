import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: {
    default: 'Desi Wedding Marketplace — Chicago',
    template: '%s | Desi Wedding Marketplace',
  },
  description:
    'Discover, compare, and book verified Desi wedding vendors in Chicago. AI-powered search, transparent pricing, and secure hold deposits.',
  keywords: [
    'desi wedding',
    'chicago wedding vendors',
    'south asian wedding',
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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
