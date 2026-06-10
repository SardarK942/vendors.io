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
  /** Hero photo for the tile. Hosted on UploadThing (utfs.io) — owned URLs,
   *  no third-party API key exposure, immune to upstream rotation. */
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
    photoUrl: 'https://iryyjgk4z6.ufs.sh/f/D4Fxxpb8A6TPLCV4vLdDbtXRVd6vxSYNQeCuh5kyUAJHr10w',
    alt: 'South Asian wedding couple in a ceremony',
    comingSoon: false,
  },
  {
    slug: 'videography',
    label: 'Videography & Content',
    kicker: 'Visual',
    photoUrl: 'https://iryyjgk4z6.ufs.sh/f/D4Fxxpb8A6TPOFxoUEHZicD1KWg6MSjTLJnYR98myEdeAlNo',
    alt: 'Wedding videographer with a cinema camera',
    comingSoon: false,
  },
  {
    slug: 'hair_makeup',
    label: 'Hair & Makeup',
    kicker: 'Beauty',
    photoUrl: 'https://iryyjgk4z6.ufs.sh/f/D4Fxxpb8A6TPXCDGpBtqaYn4pFyo0HQ7sjtMD3GIlm1LN8vC',
    alt: 'South Asian bride having makeup applied',
    comingSoon: false,
  },
  {
    slug: 'bridal_wear',
    label: 'Bridal Wear',
    kicker: 'Beauty',
    photoUrl: 'https://iryyjgk4z6.ufs.sh/f/D4Fxxpb8A6TPDGocMTb8A6TPQOM5kVpZqgfnE3RSWozmYiN4',
    alt: 'Bride in a red bridal lehenga',
    comingSoon: true,
  },
  {
    slug: 'mehndi',
    label: 'Mehndi / Henna',
    kicker: 'Tradition',
    photoUrl: 'https://iryyjgk4z6.ufs.sh/f/D4Fxxpb8A6TPLCIN9cdDbtXRVd6vxSYNQeCuh5kyUAJHr10w',
    alt: 'Hands decorated with intricate mehndi henna',
    comingSoon: false,
  },
  {
    slug: 'catering',
    label: 'Catering',
    kicker: 'Food',
    photoUrl: 'https://iryyjgk4z6.ufs.sh/f/D4Fxxpb8A6TPFaCamo1jR2Z16kKlWiqTLt5Xz8DGAwyd4HgQ',
    alt: 'Biryani served at a South Asian wedding',
    comingSoon: false,
  },
  {
    slug: 'carts',
    label: 'Carts',
    kicker: 'Food',
    photoUrl: 'https://iryyjgk4z6.ufs.sh/f/D4Fxxpb8A6TPqoN4nc5deEKg613hWIHZtMsY8aTpQvVxkui7',
    alt: 'Steaming cup of chai served at a wedding',
    comingSoon: false,
  },
  {
    slug: 'dj',
    label: 'DJ',
    kicker: 'Entertainment',
    photoUrl: 'https://iryyjgk4z6.ufs.sh/f/D4Fxxpb8A6TPOVdnUpHZicD1KWg6MSjTLJnYR98myEdeAlNo',
    alt: 'DJ behind a console with stage lighting',
    comingSoon: false,
  },
  {
    slug: 'live_music',
    label: 'Live Music & Performance',
    kicker: 'Entertainment',
    photoUrl: 'https://iryyjgk4z6.ufs.sh/f/D4Fxxpb8A6TPq2Zt1k5deEKg613hWIHZtMsY8aTpQvVxkui7',
    alt: 'Dhol drummer performing at a baraat',
    comingSoon: false,
  },
  {
    slug: 'decor',
    label: 'Decor & Floral',
    kicker: 'Atmosphere',
    photoUrl: 'https://iryyjgk4z6.ufs.sh/f/D4Fxxpb8A6TPkVe7ZgIjlX45n7sT0u2NhOobr3e1W98Fyxip',
    alt: 'Floral mandap installation at a South Asian wedding',
    comingSoon: true,
  },
  {
    slug: 'venue',
    label: 'Venue',
    kicker: 'Space',
    photoUrl: 'https://iryyjgk4z6.ufs.sh/f/D4Fxxpb8A6TPb3WTn76WA6ONcBD7dQZXKPkV8TajJxf5lFrI',
    alt: 'Indian wedding venue with a decorated mandap',
    comingSoon: true,
  },
];
