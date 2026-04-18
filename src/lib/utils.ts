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

/** Hold deposit = 10% of the vendor quote. */
export function calculateDepositAmount(quoteAmountCents: number): number {
  return Math.round(quoteAmountCents / 10);
}

/** Platform's cut of a deposit (30%). Held in escrow until 24h grace elapses. */
export function calculatePlatformCut(depositCents: number): number {
  return Math.round(depositCents * 0.3);
}

/** Vendor's portion of a deposit (70%). Escrowed until event completes. */
export function calculateVendorPending(depositCents: number): number {
  return depositCents - calculatePlatformCut(depositCents);
}

/**
 * @deprecated Use calculatePlatformCut. Kept for back-compat while code migrates.
 */
export function calculatePlatformFee(amountCents: number, feePercentage: number = 30): number {
  return Math.round((amountCents * feePercentage) / 100);
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
  'rejected',
  'deposit_paid',
  'couple_cancelled',
  'vendor_cancelled',
  'cancelled_mutual',
  'completed',
  'expired',
] as const;
