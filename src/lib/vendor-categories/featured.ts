/**
 * The 11 vendor categories featured on the homepage HoverExpand strip.
 * Locked order (bride-journey first) and Coming Soon flags per the spec
 * at docs/superpowers/specs/2026-05-25-baazar-homepage-hero-design.md.
 *
 * The full DB-valid category list (13) lives in src/lib/utils.ts as
 * VENDOR_CATEGORIES. This file is the marketing-surface subset.
 */

export interface FeaturedCategory {
  /** Matches vendor_profiles.category in the DB. */
  slug: string;
  /** Display name on the active tile. */
  label: string;
  /** Grouping kicker shown above the label (e.g. "Visual", "Beauty"). */
  kicker: string;
  /** Hero photo for the tile. Day 1 = Unsplash stand-ins; future = curated. */
  photoUrl: string;
  /** Photo alt text. */
  alt: string;
  /** When true, tile shows the "Coming Soon" treatment regardless of vendor count. */
  comingSoon: boolean;
}

export const CATEGORIES_FEATURED: readonly FeaturedCategory[] = [
  {
    slug: 'photography',
    label: 'Photography',
    kicker: 'Visual',
    photoUrl: 'https://images.unsplash.com/photo-1606216794074-735e91aa2c92?w=1200&q=85',
    alt: 'South Asian wedding couple under a mandap',
    comingSoon: false,
  },
  {
    slug: 'videography',
    label: 'Videography & Content',
    kicker: 'Visual',
    photoUrl: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=1200&q=85',
    alt: 'Videographer shooting an event with a cinema camera',
    comingSoon: false,
  },
  {
    slug: 'hair_makeup',
    label: 'Hair & Makeup',
    kicker: 'Beauty',
    photoUrl: 'https://images.unsplash.com/photo-1522338242992-e1a54906a8da?w=1200&q=85',
    alt: 'Bride having her makeup applied by an artist',
    comingSoon: false,
  },
  {
    slug: 'bridal_wear',
    label: 'Bridal Wear',
    kicker: 'Beauty',
    photoUrl: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=1200&q=85',
    alt: 'Bridal lehenga detail on a hanger',
    comingSoon: true,
  },
  {
    slug: 'mehndi',
    label: 'Mehndi / Henna',
    kicker: 'Tradition',
    photoUrl: 'https://images.unsplash.com/photo-1604423466938-c63b29b9c5e9?w=1200&q=85',
    alt: 'Hands decorated with intricate mehndi henna designs',
    comingSoon: false,
  },
  {
    slug: 'catering',
    label: 'Catering',
    kicker: 'Food',
    photoUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=1200&q=85',
    alt: 'South Asian wedding catering buffet spread',
    comingSoon: false,
  },
  {
    slug: 'carts',
    label: 'Carts',
    kicker: 'Food',
    photoUrl: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=85',
    alt: 'Chai cart with steaming cups at a wedding',
    comingSoon: false,
  },
  {
    slug: 'dj',
    label: 'DJ',
    kicker: 'Entertainment',
    photoUrl: 'https://images.unsplash.com/photo-1571266028253-6c1d4040d6cc?w=1200&q=85',
    alt: 'DJ at the turntables with festival lighting',
    comingSoon: false,
  },
  {
    slug: 'live_music',
    label: 'Live Music & Performance',
    kicker: 'Entertainment',
    photoUrl: 'https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=1200&q=85',
    alt: 'Dhol drummer performing at a wedding baraat',
    comingSoon: false,
  },
  {
    slug: 'decor',
    label: 'Decor & Floral',
    kicker: 'Atmosphere',
    photoUrl: 'https://images.unsplash.com/photo-1561128290-006dc4827214?w=1200&q=85',
    alt: 'Floral installation at a wedding mandap',
    comingSoon: true,
  },
  {
    slug: 'venue',
    label: 'Venue',
    kicker: 'Space',
    photoUrl: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=1200&q=85',
    alt: 'Wedding venue ballroom set for a reception',
    comingSoon: true,
  },
];
