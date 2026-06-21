import {
  Search,
  Heart,
  ShieldCheck,
  Eye,
  CalendarCheck,
  CreditCard,
  type LucideIcon,
} from 'lucide-react';
import { VENDOR_CATEGORIES } from '@/lib/utils';

export interface OnboardingFeature {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  /** Image preview for the right column. Day 1: empty string (renders placeholder); future: licensed assets. */
  image: string;
}

export interface OnboardingTip {
  number: number;
  text: string;
}

export const COUPLE_FEATURES: readonly OnboardingFeature[] = [
  {
    id: 'browse',
    icon: Search,
    title: 'Browse verified vendors',
    description:
      'Search Chicago vendors curated for cultural weddings — photographers, mehndi artists, caterers, and more.',
    image: '',
  },
  {
    id: 'save',
    icon: Heart,
    title: 'Save & compare',
    description:
      'Heart the vendors you love. Compare packages, pricing, and availability side-by-side.',
    image: '',
  },
  {
    id: 'book',
    icon: ShieldCheck,
    title: 'Book with confidence',
    description:
      "Small hold deposits via Stripe. Full refund if the vendor doesn't confirm within 72 hours.",
    image: '',
  },
];

export const COUPLE_TIPS: readonly OnboardingTip[] = [
  {
    number: 1,
    text: 'Click the heart on any vendor card to save them. Your shortlist lives in your dashboard.',
  },
  {
    number: 2,
    text: 'Submitting a booking request sends it to the vendor — they respond within 72 hours with their quote. You only pay the hold deposit if you accept.',
  },
  {
    number: 3,
    text: "For non-standard requests (multi-day events, custom catering, large guest counts), use the Custom Request card on a vendor's profile to brief them directly.",
  },
];

export const VENDOR_FEATURES: readonly OnboardingFeature[] = [
  {
    id: 'discovered',
    icon: Eye,
    title: 'Get discovered',
    description:
      "Chicago customers search verified vendors in your category. Show up where they're already looking.",
    image: '',
  },
  {
    id: 'calendar',
    icon: CalendarCheck,
    title: 'Manage your calendar',
    description:
      'Block dates, set capacity, prevent double-bookings. We automatically check availability before accepting bookings.',
    image: '',
  },
  {
    id: 'paid',
    icon: CreditCard,
    title: 'Get paid securely',
    description:
      'Customers pay a 5% deposit through Baazar. You collect the 95% balance directly from them — we handle the admin.',
    image: '',
  },
];

export const VENDOR_TIPS: readonly OnboardingTip[] = [
  {
    number: 1,
    text: "Complete your profile (basics, photos, packages) to publish to the marketplace. Customers can't book you until you publish.",
  },
  {
    number: 2,
    text: 'Set your response SLA in Step 4 of the wizard (Profile Details). Customers see this on your card — fast responders book more.',
  },
  {
    number: 3,
    text: 'Keep your calendar up to date. Blocked dates prevent surprise double-bookings and protect your reputation.',
  },
];

export const YEARS_IN_BUSINESS = ['0-1', '1-3', '3-10', '10+'] as const;
export type YearsInBusiness = (typeof YEARS_IN_BUSINESS)[number];

/**
 * The 10 commission-model categories vendors can pick during onboarding.
 * Excludes bridal_wear, decor, venue (Coming Soon — flat-fee infrastructure
 * lands in a future sub-project).
 */
const COMING_SOON_SLUGS = new Set(['bridal_wear', 'decor', 'venue']);
export const COMMISSION_CATEGORIES: readonly string[] = VENDOR_CATEGORIES.filter(
  (slug) => !COMING_SOON_SLUGS.has(slug)
);
