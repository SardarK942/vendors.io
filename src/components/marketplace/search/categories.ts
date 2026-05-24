import type { LucideIcon } from 'lucide-react';
import {
  Grid,
  Camera,
  Video,
  Sparkles,
  Scissors,
  Music,
  ChefHat,
  Building2,
  Flower2,
  Mail,
} from 'lucide-react';
import { VENDOR_CATEGORIES, VENDOR_CATEGORY_LABELS } from '@/lib/utils';

export interface Category {
  slug: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Icon mapping for each DB vendor category slug.
 * Icons are UI-only and not shared with the backend, so we keep this local.
 * Slugs must match VENDOR_CATEGORIES in src/lib/utils.ts — that file is the
 * single source of truth for the vendor_profiles.category DB enum.
 */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  photography: Camera,
  videography: Video,
  mehndi: Sparkles,
  hair_makeup: Scissors,
  dj: Music,
  photobooth: Camera,
  catering: ChefHat,
  venue: Building2,
  decor: Flower2,
  invitations: Mail,
};

/**
 * Full category list for the search bar Category picker.
 * Derived from the canonical VENDOR_CATEGORIES + VENDOR_CATEGORY_LABELS in
 * src/lib/utils.ts so slugs always match the DB CHECK constraint — no drift.
 * The "all" entry at the head is the pill's "no filter" state and is not a
 * real DB category.
 */
export const CATEGORIES: Category[] = [
  { slug: 'all', label: 'All vendors', icon: Grid },
  ...VENDOR_CATEGORIES.map((slug) => ({
    slug,
    label: VENDOR_CATEGORY_LABELS[slug] ?? slug,
    icon: CATEGORY_ICONS[slug] ?? Grid,
  })),
];

/**
 * Static popular queries used by the What picker's typeahead.
 * Day 1 is hardcoded; a follow-up will swap to a `/api/search/suggest` endpoint.
 */
export const POPULAR_QUERIES: string[] = [
  'South Asian wedding photographer',
  'Bollywood DJ in Chicago',
  'Mehndi artist near downtown',
  'Hindu wedding venue with mandap',
  'Halal catering for 200 guests',
];

/** Get a category by slug. Returns `undefined` if not found. */
export function findCategory(slug: string | undefined): Category | undefined {
  if (!slug) return undefined;
  return CATEGORIES.find((c) => c.slug === slug);
}
