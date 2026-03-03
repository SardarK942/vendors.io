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

/** Calculate platform fee in cents (integer math, never floating point). */
export function calculatePlatformFee(amountCents: number, feePercentage: number = 10): number {
  return Math.round((amountCents * feePercentage) / 100);
}

/** Calculate hold deposit: $50 or 10% of quote, whichever is less. */
export function calculateDepositAmount(quoteAmountCents: number): number {
  const tenPercent = Math.round(quoteAmountCents / 10);
  const fiftyCents = 5000; // $50 in cents
  return Math.min(tenPercent, fiftyCents);
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

/** Vendor categories */
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
] as const;

export const VENDOR_CATEGORY_LABELS: Record<string, string> = {
  photography: 'Photography',
  videography: 'Videography',
  mehndi: 'Mehndi / Henna',
  hair_makeup: 'Hair & Makeup',
  dj: 'DJ & Music',
  photobooth: 'Photo Booth',
  catering: 'Catering',
  venue: 'Venue',
  decor: 'Decor & Floral',
  invitations: 'Invitations',
};

export const EVENT_TYPES = [
  'engagement',
  'mehndi',
  'sangeet',
  'wedding',
  'reception',
  'multiple',
] as const;

export const EVENT_TYPE_LABELS: Record<string, string> = {
  engagement: 'Engagement',
  mehndi: 'Mehndi',
  sangeet: 'Sangeet',
  wedding: 'Wedding Ceremony',
  reception: 'Reception',
  multiple: 'Multiple Events',
};

export const BOOKING_STATUSES = [
  'pending',
  'quoted',
  'deposit_paid',
  'confirmed',
  'expired',
  'declined',
  'cancelled',
] as const;
