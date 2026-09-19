/**
 * Per-category package-model archetypes (Phase 1, Slice 1 foundation).
 *
 * A pure, side-effect-free lookup that classifies each vendor category into one
 * of three package "archetypes" and describes how the shared package fields
 * (max_guests, duration_hours, pricing_unit) should behave for that category.
 *
 * This is the single source of truth the editor/display layers will later read
 * so field visibility, labels, and the allowed pricing units stay consistent.
 * It is intentionally additive: it does not change any editor UI, display, or
 * pricing math yet — see the locked spec
 * (docs/superpowers/specs/2026-09-17-package-model-locked-decisions.md).
 */

/** Pricing units a package's headline price can be expressed in. */
export type PricingUnit =
  | 'flat'
  | 'per_hour'
  | 'per_person'
  | 'per_guest'
  | 'per_serving'
  | 'per_item'
  | 'per_day';

/** Every supported pricing unit, in canonical order. */
export const PACKAGE_PRICING_UNITS = [
  'flat',
  'per_hour',
  'per_person',
  'per_guest',
  'per_serving',
  'per_item',
  'per_day',
] as const satisfies readonly PricingUnit[];

/** The three package-model archetype groups. */
export type PackageArchetype = 'time_based' | 'per_unit' | 'flat_rate';

/** How a shared package field is surfaced for a given category. */
export type FieldMode = 'hidden' | 'optional' | 'required';

export interface PackageFieldConfig {
  archetype: PackageArchetype;
  maxGuests: FieldMode;
  maxGuestsLabel: string;
  durationHours: FieldMode;
  durationHoursLabel: string;
  /** Allowed pricing units for this category (first entry = default). */
  pricingUnits: PricingUnit[];
  defaultPricingUnit: PricingUnit;
  /** Preserve the carts guests/servings capacity-unit toggle. */
  capacityUnitEditable: boolean;
}

/**
 * Internal per-category table. Both public functions read from this so the
 * archetype and field config can never drift. `defaultPricingUnit` is always
 * derived from `pricingUnits[0]`, so it is intentionally not stored here.
 */
type CategoryConfig = Omit<PackageFieldConfig, 'defaultPricingUnit'>;

const DEFAULT_CONFIG: CategoryConfig = {
  archetype: 'time_based',
  maxGuests: 'hidden',
  maxGuestsLabel: 'Max guests',
  durationHours: 'optional',
  durationHoursLabel: 'Hours',
  pricingUnits: ['flat'],
  capacityUnitEditable: false,
};

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  photography: {
    archetype: 'time_based',
    maxGuests: 'hidden',
    maxGuestsLabel: 'Max guests',
    durationHours: 'required',
    durationHoursLabel: 'Coverage hours',
    pricingUnits: ['flat'],
    capacityUnitEditable: false,
  },
  videography: {
    archetype: 'time_based',
    maxGuests: 'hidden',
    maxGuestsLabel: 'Max guests',
    durationHours: 'required',
    durationHoursLabel: 'Coverage hours',
    pricingUnits: ['flat'],
    capacityUnitEditable: false,
  },
  content_creation: {
    archetype: 'time_based',
    maxGuests: 'hidden',
    maxGuestsLabel: 'Max guests',
    durationHours: 'required',
    durationHoursLabel: 'Coverage hours',
    pricingUnits: ['flat'],
    capacityUnitEditable: false,
  },
  dj: {
    archetype: 'time_based',
    maxGuests: 'hidden',
    maxGuestsLabel: 'Max guests',
    durationHours: 'required',
    durationHoursLabel: 'Hours',
    pricingUnits: ['flat'],
    capacityUnitEditable: false,
  },
  photobooth: {
    archetype: 'time_based',
    maxGuests: 'hidden',
    maxGuestsLabel: 'Max guests',
    durationHours: 'required',
    durationHoursLabel: 'Rental hours',
    pricingUnits: ['flat'],
    capacityUnitEditable: false,
  },
  live_music: {
    archetype: 'time_based',
    maxGuests: 'hidden',
    maxGuestsLabel: 'Max guests',
    durationHours: 'required',
    durationHoursLabel: 'Hours',
    pricingUnits: ['flat'],
    capacityUnitEditable: false,
  },
  catering: {
    archetype: 'per_unit',
    maxGuests: 'optional',
    maxGuestsLabel: 'Guests',
    durationHours: 'optional',
    durationHoursLabel: 'Hours',
    pricingUnits: ['per_guest', 'flat', 'per_serving'],
    capacityUnitEditable: false,
  },
  hair_makeup: {
    archetype: 'per_unit',
    maxGuests: 'hidden',
    maxGuestsLabel: 'Max guests',
    durationHours: 'hidden',
    durationHoursLabel: 'Hours',
    pricingUnits: ['flat', 'per_person'],
    capacityUnitEditable: false,
  },
  carts: {
    archetype: 'per_unit',
    maxGuests: 'optional',
    maxGuestsLabel: 'Servings',
    durationHours: 'optional',
    durationHoursLabel: 'Hours',
    pricingUnits: ['flat', 'per_serving'],
    capacityUnitEditable: true,
  },
  invitations: {
    archetype: 'per_unit',
    maxGuests: 'hidden',
    maxGuestsLabel: 'Max guests',
    durationHours: 'hidden',
    durationHoursLabel: 'Hours',
    pricingUnits: ['per_item', 'flat'],
    capacityUnitEditable: false,
  },
  gifts: {
    archetype: 'per_unit',
    maxGuests: 'optional',
    maxGuestsLabel: 'Pieces',
    durationHours: 'hidden',
    durationHoursLabel: 'Hours',
    pricingUnits: ['flat', 'per_item'],
    capacityUnitEditable: false,
  },
  mehndi: {
    archetype: 'per_unit',
    maxGuests: 'hidden',
    maxGuestsLabel: 'Max guests',
    durationHours: 'optional',
    durationHoursLabel: 'Hours',
    pricingUnits: ['flat', 'per_person'],
    capacityUnitEditable: false,
  },
  venue: {
    archetype: 'flat_rate',
    maxGuests: 'required',
    maxGuestsLabel: 'Max capacity',
    durationHours: 'optional',
    durationHoursLabel: 'Rental hours',
    pricingUnits: ['per_day', 'flat'],
    capacityUnitEditable: false,
  },
  decor: {
    archetype: 'flat_rate',
    maxGuests: 'hidden',
    maxGuestsLabel: 'Max guests',
    durationHours: 'hidden',
    durationHoursLabel: 'Hours',
    pricingUnits: ['flat'],
    capacityUnitEditable: false,
  },
  bridal_wear: {
    archetype: 'flat_rate',
    maxGuests: 'hidden',
    maxGuestsLabel: 'Max guests',
    durationHours: 'hidden',
    durationHoursLabel: 'Hours',
    pricingUnits: ['flat'],
    capacityUnitEditable: false,
  },
};

/**
 * Display-only price suffix for a pricing unit (Phase 1, Slice 4). Appended to a
 * rendered "$X" figure for customer-facing context — never used in price math.
 * 'flat' (and, by extension, any pre-migration package that has no pricing_unit
 * and is treated as 'flat') yields '' so the price renders unchanged.
 */
export function pricingUnitSuffix(unit: PricingUnit): string {
  switch (unit) {
    case 'per_guest':
      return ' /guest';
    case 'per_person':
      return ' /person';
    case 'per_serving':
      return ' /serving';
    case 'per_item':
      return ' /item';
    case 'per_hour':
      return ' /hour';
    case 'per_day':
      return ' /day';
    case 'flat':
    default:
      return '';
  }
}

function resolveConfig(category: string): CategoryConfig {
  return CATEGORY_CONFIG[category] ?? DEFAULT_CONFIG;
}

/** Classify a vendor category into its package-model archetype. */
export function getPackageArchetype(category: string): PackageArchetype {
  return resolveConfig(category).archetype;
}

/**
 * Full per-category field configuration (field visibility, labels, allowed
 * pricing units). `defaultPricingUnit` is always the first allowed unit.
 */
export function getPackageFieldConfig(category: string): PackageFieldConfig {
  const cfg = resolveConfig(category);
  return { ...cfg, defaultPricingUnit: cfg.pricingUnits[0] };
}
