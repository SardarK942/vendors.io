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

export interface Category {
  slug: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Static category list for the search bar Category picker.
 *
 * NOTE: This duplicates the `vendor_profiles.category` enum on the backend.
 * If the enum drifts, this list drifts. Follow-up: derive both from a single
 * shared constant or generate from a Supabase types file.
 */
export const CATEGORIES: Category[] = [
  { slug: 'all', label: 'All vendors', icon: Grid },
  { slug: 'photography', label: 'Photography', icon: Camera },
  { slug: 'videography', label: 'Videography', icon: Video },
  { slug: 'mehndi-henna', label: 'Mehndi / Henna', icon: Sparkles },
  { slug: 'hair-makeup', label: 'Hair & Makeup', icon: Scissors },
  { slug: 'dj-music', label: 'DJ & Music', icon: Music },
  { slug: 'photo-booth', label: 'Photo Booth', icon: Camera },
  { slug: 'catering', label: 'Catering', icon: ChefHat },
  { slug: 'venue', label: 'Venue', icon: Building2 },
  { slug: 'decor-floral', label: 'Decor & Floral', icon: Flower2 },
  { slug: 'invitations', label: 'Invitations', icon: Mail },
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
