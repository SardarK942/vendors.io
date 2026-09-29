/**
 * Garment taxonomy for the bridal/groom wear Shop (prototype — Slice 1).
 *
 * Single source of truth for the display side of products.garment_type. Kept in
 * sync with the CHECK constraint in migration 00082, the GarmentType union in
 * src/types/database.types.ts, and productGarmentTypeSchema in src/types/index.ts.
 * Consumed by the later UI workstreams (WS-2/WS-3) for chips, filters, labels.
 */

import type { GarmentType } from '@/types/database.types';

export const GARMENT_TYPES: readonly GarmentType[] = [
  'saree',
  'lehenga',
  'bridal_gown',
  'sherwani',
  'groom_suit',
  'kurta',
  'anarkali',
  'accessories',
  'other',
] as const;

export const GARMENT_TYPE_LABELS: Record<GarmentType, string> = {
  saree: 'Saree',
  lehenga: 'Lehenga',
  bridal_gown: 'Bridal Gown',
  sherwani: 'Sherwani',
  groom_suit: 'Groom Suit',
  kurta: 'Kurta',
  anarkali: 'Anarkali',
  accessories: 'Accessories',
  other: 'Other',
};
