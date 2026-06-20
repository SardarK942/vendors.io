/**
 * Shared constants for the filter chip system + onboarding wizard.
 * Sourced of truth: this file. Both the chip UI and the onboarding wizard's
 * Languages/Years/Response-SLA inputs reference the same lists.
 */

export interface LanguageOption {
  slug: string;
  label: string;
}

export const LANGUAGES: LanguageOption[] = [
  { slug: 'hindi', label: 'Hindi' },
  { slug: 'urdu', label: 'Urdu' },
  { slug: 'punjabi', label: 'Punjabi' },
  { slug: 'bengali', label: 'Bengali' },
  { slug: 'gujarati', label: 'Gujarati' },
  { slug: 'tamil', label: 'Tamil' },
  { slug: 'telugu', label: 'Telugu' },
  { slug: 'marathi', label: 'Marathi' },
  { slug: 'arabic', label: 'Arabic' },
  { slug: 'english', label: 'English' },
];

export type PriceBand = 'budget' | 'mid' | 'premium' | 'luxury';

export interface PriceBandOption {
  slug: PriceBand;
  label: string;
  /** Display shorthand for chip UI. */
  shorthand: string;
  /** Derived range in cents — used as placeholder in min/max inputs. */
  minCents: number;
  maxCents: number | null;
}

export const PRICE_BANDS: PriceBandOption[] = [
  { slug: 'budget', label: 'Budget', shorthand: '$', minCents: 0, maxCents: 100_000 },
  { slug: 'mid', label: 'Mid', shorthand: '$$', minCents: 100_000, maxCents: 500_000 },
  { slug: 'premium', label: 'Premium', shorthand: '$$$', minCents: 500_000, maxCents: 1_500_000 },
  { slug: 'luxury', label: 'Luxury', shorthand: '$$$$', minCents: 1_500_000, maxCents: null },
];

export const RESPONSE_SLA_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'Within 1 hour' },
  { value: 4, label: 'Within 4 hours' },
  { value: 24, label: 'Within 24 hours' },
  { value: 48, label: 'Within 48 hours' },
  { value: 72, label: 'Within 72 hours' },
];

export const YEARS_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: '1+ years' },
  { value: 3, label: '3+ years' },
  { value: 5, label: '5+ years' },
  { value: 10, label: '10+ years' },
];

/**
 * @deprecated Use EVENT_TYPES from '@/types' instead.
 * This legacy 6-entry list will be removed in T3 once all consumers migrate.
 */
export const EVENT_TYPES_LEGACY: { slug: string; label: string }[] = [
  { slug: 'wedding', label: 'Wedding ceremony' },
  { slug: 'reception', label: 'Reception' },
  { slug: 'sangeet', label: 'Sangeet' },
  { slug: 'mehndi', label: 'Mehndi' },
  { slug: 'baraat', label: 'Baraat' },
  { slug: 'engagement', label: 'Engagement' },
];
