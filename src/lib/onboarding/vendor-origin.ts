import type { VendorOrigin } from '@/types/database.types';

/**
 * Vendor-origin fork options (migration 00085).
 *
 * Surfaced only for bridal_wear vendors in onboarding. Local vendors price in
 * USD directly; international vendors declare a home country + currency so the
 * Phase-2 landed-price engine can convert wholesale → all-in DDP retail.
 * See docs/superpowers/specs/2026-10-02-vendor-origin-and-landed-pricing.md
 */

export const VENDOR_ORIGINS: readonly VendorOrigin[] = ['local', 'international'] as const;

export const VENDOR_ORIGIN_LABELS: Record<VendorOrigin, string> = {
  local: 'Local (Chicago-area)',
  international: 'International',
};

/** Countries an international bridal vendor can select. Value = stored label. */
export const VENDOR_COUNTRIES = [
  'India',
  'Pakistan',
  'Bangladesh',
  'United Kingdom',
  'UAE',
  'Canada',
  'Other',
] as const;

export type VendorCountry = (typeof VENDOR_COUNTRIES)[number];

/** Currency codes an international bridal vendor can quote in (lowercase, app convention). */
export const VENDOR_CURRENCIES = ['inr', 'pkr', 'bdt', 'gbp', 'aed', 'cad', 'usd'] as const;

export type VendorCurrency = (typeof VENDOR_CURRENCIES)[number];

export const VENDOR_CURRENCY_LABELS: Record<VendorCurrency, string> = {
  inr: 'INR — Indian Rupee',
  pkr: 'PKR — Pakistani Rupee',
  bdt: 'BDT — Bangladeshi Taka',
  gbp: 'GBP — British Pound',
  aed: 'AED — UAE Dirham',
  cad: 'CAD — Canadian Dollar',
  usd: 'USD — US Dollar',
};

export const INTERNATIONAL_COMING_SOON_NOTICE =
  "International selling is coming soon. We'll save your shop details and reach out when it's ready.";
