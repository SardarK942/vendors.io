/**
 * Stitching-level customization taxonomy for the bridal/groom wear Shop (pure,
 * no React/DOM).
 *
 * Single source of truth for the stitching-level discriminator stored in
 * products.customization_types (migration 00084). Generalizes the inert
 * `tailoring_available` boolean into concrete offerings a vendor supports.
 * Values are validated in the app layer (Zod createProductSchema) rather than
 * by a DB CHECK, matching the `subcategories text[]` pattern.
 *
 * Kept in sync with: CustomizationType in src/types/database.types.ts, the
 * customization_types Zod enum in src/types/index.ts, and the value comment in
 * migration 00084.
 *
 * See docs/superpowers/specs/2026-09-27-product-customization-types.md
 */

export type CustomizationType =
  | 'unstitched'
  | 'semi_stitched'
  | 'standard_size'
  | 'made_to_measure'
  | 'pre_stitched';

export const CUSTOMIZATION_TYPES: CustomizationType[] = [
  'unstitched',
  'semi_stitched',
  'standard_size',
  'made_to_measure',
  'pre_stitched',
];

/**
 * The two options vendors actually choose from in the editor. Local bridal
 * vendors sell either ready-made (a standard size, as shown) or made to measure
 * (stitched to the wearer); the three export-market tiers (unstitched,
 * semi_stitched, pre_stitched) stay valid in the data model but aren't surfaced
 * in the UI to keep listing an outfit simple.
 */
export const VENDOR_CUSTOMIZATION_TYPES: CustomizationType[] = ['standard_size', 'made_to_measure'];

export const CUSTOMIZATION_TYPE_LABELS: Record<CustomizationType, string> = {
  unstitched: 'Unstitched',
  semi_stitched: 'Semi-stitched',
  standard_size: 'Ready-made',
  made_to_measure: 'Made to measure',
  pre_stitched: 'Pre-stitched',
};

export const CUSTOMIZATION_TYPE_BLURB: Record<CustomizationType, string> = {
  unstitched: 'Fabric only, stitched by your own tailor.',
  semi_stitched: 'Ships part-finished for a local tailor to complete.',
  standard_size: 'Buy as shown, in a standard size.',
  made_to_measure: 'Stitched to the wearer’s exact measurements.',
  pre_stitched: 'Pre-draped and ready to wear.',
};

/**
 * Maps a product `garment_type` to the measurement schema that applies to it
 * (see measurement-schemas.ts). Only garments with a vetted made-to-measure
 * field set map to a schema; everything else returns null (no schema yet).
 * A simple lookup so more garments can be added later.
 */
export function garmentToMeasurementGarment(garmentType: string): 'lehenga' | 'sherwani' | null {
  const map: Record<string, 'lehenga' | 'sherwani'> = {
    lehenga: 'lehenga',
    sherwani: 'sherwani',
  };
  return map[garmentType] ?? null;
}

/** True if the product offers a made-to-measure stitching level. */
export function offersMadeToMeasure(customizationTypes: string[]): boolean {
  return customizationTypes.includes('made_to_measure');
}
