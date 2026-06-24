import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format cents to USD string. All prices stored as integers in cents. */
export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

/** Unified deposit rate for all vendors (5% of total). */
export const DEPOSIT_RATE = 0.05;

/** Hold deposit = DEPOSIT_RATE (5%) of the vendor quote. */
export function calculateDepositAmount(quoteAmountCents: number): number {
  return Math.round(quoteAmountCents * DEPOSIT_RATE);
}

/**
 * Wrap async operations with consistent error handling.
 * Returns [data, null] on success, [null, error] on failure.
 */
export async function tryCatch<T>(fn: () => Promise<T>): Promise<[T, null] | [null, Error]> {
  try {
    const result = await fn();
    return [result, null];
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`[tryCatch] ${err.message}`, err);
    return [null, err];
  }
}

/** Generate a URL-friendly slug from a business name */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// All categories valid in the DB (vendor_profiles.category CHECK).
// Some are not featured on the homepage but are kept for existing-row compatibility
// (photobooth + invitations) or land Day 1 as "Coming Soon" (bridal_wear + decor + venue).
// Featured-on-homepage subset is exported separately from src/lib/vendor-categories/featured.ts.
export const VENDOR_CATEGORIES = [
  'photography',
  'videography',
  'mehndi',
  'hair_makeup',
  'dj',
  'photobooth',
  'catering',
  'venue',
  'decor',
  'invitations',
  'bridal_wear',
  'live_music',
  'carts',
] as const;

export const VENDOR_CATEGORY_LABELS: Record<string, string> = {
  photography: 'Photography',
  videography: 'Videography & Content',
  mehndi: 'Mehndi / Henna',
  hair_makeup: 'Hair & Makeup',
  dj: 'DJ',
  photobooth: 'Photo Booth',
  catering: 'Catering',
  venue: 'Venue',
  decor: 'Decor & Floral',
  invitations: 'Invitations',
  bridal_wear: 'Bridal Wear',
  live_music: 'Live Music & Performance',
  carts: 'Carts',
};

export const BOOKING_STATUSES = [
  'pending',
  'quoted',
  'rejected',
  'deposit_paid',
  'couple_cancelled',
  'vendor_cancelled',
  'cancelled_mutual',
  'completed',
  'expired',
] as const;
