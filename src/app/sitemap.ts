import type { MetadataRoute } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// Canonical production host. The apex (baazar.io) 307-redirects to www, so the
// sitemap must list www URLs to match the indexed host. Falls back to the app
// URL env in preview/dev.
const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.baazar.io').replace(/\/$/, '');

// Regenerate at most once an hour so newly-published vendors get picked up
// without hitting the DB on every crawl.
export const revalidate = 3600;

/** Public, indexable routes that always exist. */
const STATIC_ROUTES: Array<{
  path: string;
  priority: number;
  changeFreq: MetadataRoute.Sitemap[number]['changeFrequency'];
}> = [
  { path: '/', priority: 1.0, changeFreq: 'daily' },
  { path: '/vendors', priority: 0.9, changeFreq: 'daily' },
  { path: '/join-vendor', priority: 0.7, changeFreq: 'monthly' },
  { path: '/signup', priority: 0.5, changeFreq: 'monthly' },
  { path: '/privacy', priority: 0.3, changeFreq: 'yearly' },
  { path: '/terms', priority: 0.3, changeFreq: 'yearly' },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFreq,
    priority: r.priority,
  }));

  // Live vendor profiles — same predicate the /vendors listing uses.
  let vendorEntries: MetadataRoute.Sitemap = [];
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from('vendor_profiles')
      .select('slug, updated_at')
      .eq('is_active', true)
      .eq('onboarding_complete', true)
      .not('slug', 'is', null);

    vendorEntries = (data ?? [])
      .filter((v): v is { slug: string; updated_at: string } => Boolean(v.slug))
      .map((v) => ({
        url: `${SITE_URL}/vendors/${v.slug}`,
        lastModified: v.updated_at ? new Date(v.updated_at) : now,
        changeFrequency: 'weekly',
        priority: 0.8,
      }));
  } catch {
    // Never let a transient DB error break the build/crawl — ship the static
    // routes and let the next revalidation pick up vendors.
    vendorEntries = [];
  }

  return [...staticEntries, ...vendorEntries];
}
