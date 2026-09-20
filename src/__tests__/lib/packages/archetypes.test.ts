import { describe, it, expect } from 'vitest';
import {
  PACKAGE_PRICING_UNITS,
  getPackageArchetype,
  getPackageFieldConfig,
  pricingUnitSuffix,
} from '@/lib/packages/archetypes';

describe('PACKAGE_PRICING_UNITS', () => {
  it('lists every supported pricing unit', () => {
    expect(PACKAGE_PRICING_UNITS).toEqual([
      'flat',
      'per_hour',
      'per_person',
      'per_guest',
      'per_serving',
      'per_item',
      'per_day',
    ]);
  });
});

describe('pricingUnitSuffix', () => {
  it('returns an empty string for flat pricing', () => {
    expect(pricingUnitSuffix('flat')).toBe('');
  });

  it('maps each non-flat unit to its display suffix', () => {
    expect(pricingUnitSuffix('per_guest')).toBe(' /guest');
    expect(pricingUnitSuffix('per_person')).toBe(' /person');
    expect(pricingUnitSuffix('per_serving')).toBe(' /serving');
    expect(pricingUnitSuffix('per_item')).toBe(' /item');
    expect(pricingUnitSuffix('per_hour')).toBe(' /hour');
    expect(pricingUnitSuffix('per_day')).toBe(' /day');
  });

  it('covers every supported pricing unit', () => {
    for (const unit of PACKAGE_PRICING_UNITS) {
      const suffix = pricingUnitSuffix(unit);
      // flat yields '', every other unit yields a non-empty ' /…' label.
      expect(unit === 'flat' ? suffix === '' : suffix.startsWith(' /')).toBe(true);
    }
  });
});

describe('getPackageArchetype', () => {
  it('groups a sample of each archetype', () => {
    // time_based
    expect(getPackageArchetype('photography')).toBe('time_based');
    expect(getPackageArchetype('dj')).toBe('time_based');
    // per_unit
    expect(getPackageArchetype('catering')).toBe('per_unit');
    expect(getPackageArchetype('carts')).toBe('per_unit');
    expect(getPackageArchetype('gifts')).toBe('per_unit');
    // flat_rate
    expect(getPackageArchetype('venue')).toBe('flat_rate');
    expect(getPackageArchetype('decor')).toBe('flat_rate');
    expect(getPackageArchetype('bridal_wear')).toBe('flat_rate');
  });

  it('falls back to time_based for an unknown category', () => {
    expect(getPackageArchetype('unicorn_rides')).toBe('time_based');
  });
});

describe('getPackageFieldConfig', () => {
  it('configures a time_based category (photography)', () => {
    const cfg = getPackageFieldConfig('photography');
    expect(cfg.archetype).toBe('time_based');
    expect(cfg.maxGuests).toBe('hidden');
    expect(cfg.durationHours).toBe('required');
    expect(cfg.durationHoursLabel).toBe('Coverage hours');
    expect(cfg.pricingUnits).toEqual(['flat']);
    expect(cfg.defaultPricingUnit).toBe('flat');
    expect(cfg.capacityUnitEditable).toBe(false);
  });

  it('configures catering (per_unit, per_guest default)', () => {
    const cfg = getPackageFieldConfig('catering');
    expect(cfg.archetype).toBe('per_unit');
    expect(cfg.maxGuests).toBe('optional');
    expect(cfg.maxGuestsLabel).toBe('Guests');
    expect(cfg.durationHours).toBe('optional');
    expect(cfg.pricingUnits).toContain('per_guest');
    expect(cfg.defaultPricingUnit).toBe('per_guest');
    expect(cfg.capacityUnitEditable).toBe(false);
  });

  it('configures carts (capacityUnitEditable, Servings label)', () => {
    const cfg = getPackageFieldConfig('carts');
    expect(cfg.archetype).toBe('per_unit');
    expect(cfg.maxGuests).toBe('optional');
    expect(cfg.maxGuestsLabel).toBe('Servings');
    expect(cfg.capacityUnitEditable).toBe(true);
    expect(cfg.pricingUnits).toEqual(['flat', 'per_serving']);
    expect(cfg.defaultPricingUnit).toBe('flat');
  });

  it('configures venue (max capacity required, per_day default)', () => {
    const cfg = getPackageFieldConfig('venue');
    expect(cfg.archetype).toBe('flat_rate');
    expect(cfg.maxGuests).toBe('required');
    expect(cfg.maxGuestsLabel).toBe('Max capacity');
    expect(cfg.durationHours).toBe('optional');
    expect(cfg.durationHoursLabel).toBe('Rental hours');
    expect(cfg.pricingUnits).toEqual(['per_day', 'flat']);
    expect(cfg.defaultPricingUnit).toBe('per_day');
    expect(cfg.capacityUnitEditable).toBe(false);
  });

  it('falls back to a sensible default for an unknown category', () => {
    const cfg = getPackageFieldConfig('unicorn_rides');
    expect(cfg.archetype).toBe('time_based');
    expect(cfg.maxGuests).toBe('hidden');
    expect(cfg.durationHours).toBe('optional');
    expect(cfg.pricingUnits).toEqual(['flat']);
    expect(cfg.defaultPricingUnit).toBe('flat');
    expect(cfg.capacityUnitEditable).toBe(false);
  });

  it('always sets defaultPricingUnit to the first allowed unit', () => {
    const categories = [
      'photography',
      'videography',
      'content_creation',
      'dj',
      'photobooth',
      'live_music',
      'catering',
      'hair_makeup',
      'carts',
      'invitations',
      'gifts',
      'mehndi',
      'venue',
      'decor',
      'bridal_wear',
    ];
    for (const c of categories) {
      const cfg = getPackageFieldConfig(c);
      expect(cfg.defaultPricingUnit, `default for ${c}`).toBe(cfg.pricingUnits[0]);
    }
  });
});
