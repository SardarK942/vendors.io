import { describe, it, expect } from 'vitest';
import {
  CUSTOMIZATION_TYPES,
  CUSTOMIZATION_TYPE_LABELS,
  CUSTOMIZATION_TYPE_BLURB,
  garmentToMeasurementGarment,
  offersMadeToMeasure,
  type CustomizationType,
} from '@/lib/products/customization';
import { createProductSchema } from '@/types';

describe('garmentToMeasurementGarment', () => {
  it('maps lehenga to the lehenga schema', () => {
    expect(garmentToMeasurementGarment('lehenga')).toBe('lehenga');
  });

  it('maps sherwani to the sherwani schema', () => {
    expect(garmentToMeasurementGarment('sherwani')).toBe('sherwani');
  });

  it('returns null for garments without a measurement schema', () => {
    expect(garmentToMeasurementGarment('saree')).toBeNull();
    expect(garmentToMeasurementGarment('other')).toBeNull();
    expect(garmentToMeasurementGarment('bridal_gown')).toBeNull();
    expect(garmentToMeasurementGarment('')).toBeNull();
  });
});

describe('offersMadeToMeasure', () => {
  it('is true when made_to_measure is present', () => {
    expect(offersMadeToMeasure(['standard_size', 'made_to_measure'])).toBe(true);
  });

  it('is false when made_to_measure is absent', () => {
    expect(offersMadeToMeasure(['standard_size', 'unstitched'])).toBe(false);
    expect(offersMadeToMeasure([])).toBe(false);
  });
});

describe('customization taxonomy consistency', () => {
  const expected: CustomizationType[] = [
    'unstitched',
    'semi_stitched',
    'standard_size',
    'made_to_measure',
    'pre_stitched',
  ];

  it('CUSTOMIZATION_TYPES holds all five values in order', () => {
    expect(CUSTOMIZATION_TYPES).toEqual(expected);
  });

  it('every type has a non-empty label', () => {
    for (const t of CUSTOMIZATION_TYPES) {
      expect(CUSTOMIZATION_TYPE_LABELS[t]).toBeTruthy();
    }
    expect(Object.keys(CUSTOMIZATION_TYPE_LABELS).sort()).toEqual([...expected].sort());
  });

  it('every type has a non-empty blurb with no em dashes', () => {
    for (const t of CUSTOMIZATION_TYPES) {
      const blurb = CUSTOMIZATION_TYPE_BLURB[t];
      expect(blurb).toBeTruthy();
      expect(blurb).not.toContain('—');
    }
    expect(Object.keys(CUSTOMIZATION_TYPE_BLURB).sort()).toEqual([...expected].sort());
  });
});

describe('createProductSchema — customization fields', () => {
  const base = {
    title: 'Hand-embroidered lehenga',
    description: 'A festive bridal lehenga.',
    garment_type: 'lehenga' as const,
    base_price_cents: 250000,
  };

  it('parses valid customization_types + mtm_surcharge_cents', () => {
    const result = createProductSchema.safeParse({
      ...base,
      customization_types: ['standard_size', 'made_to_measure'],
      mtm_surcharge_cents: 5000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customization_types).toEqual(['standard_size', 'made_to_measure']);
      expect(result.data.mtm_surcharge_cents).toBe(5000);
    }
  });

  it('defaults customization_types to an empty array', () => {
    const result = createProductSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customization_types).toEqual([]);
    }
  });

  it('rejects an invalid customization value', () => {
    const result = createProductSchema.safeParse({
      ...base,
      customization_types: ['fully_bespoke'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a negative mtm_surcharge_cents', () => {
    const result = createProductSchema.safeParse({
      ...base,
      mtm_surcharge_cents: -100,
    });
    expect(result.success).toBe(false);
  });
});
