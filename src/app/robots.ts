import type { MetadataRoute } from 'next';

// Same canonical host derivation as sitemap.ts — apex 307-redirects to www, so
// crawlers should treat www as canonical. Falls back to the app URL env.
const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.baazar.io').replace(/\/$/, '');

// Routes kept out of the search index: private app, backend, dev/test, one-time
// links, and auth utility pages. This is crawl guidance, NOT access control —
// those routes are already auth-gated. Default-allow keeps new public pages
// crawlable without editing this list.
const DISALLOW = [
  '/dashboard',
  '/api',
  '/dev',
  '/claim',
  '/events/new',
  '/signout',
  '/login',
  '/forgot-password',
  '/reset-password',
  '/signup/success',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: DISALLOW,
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
