import { describe, it, expect } from 'vitest';
import {
  IN2CM,
  round2,
  toInches,
  toDisplay,
  fieldState,
  crossFieldWarnings,
  missingCount,
} from '@/lib/products/measurement-validation';
import {
  LEHENGA_FIELDS,
  SHERWANI_FIELDS,
  getMeasurementSchema,
} from '@/lib/products/measurement-schemas';

describe('unit conversion', () => {
  it('toInches / toDisplay are identity for inches', () => {
    expect(toInches(34, 'in')).toBe(34);
    expect(toDisplay(34, 'in')).toBe(34);
  });

  it('converts inches to cm on display', () => {
    expect(toDisplay(10, 'cm')).toBe(round2(10 * IN2CM));
    expect(toDisplay(10, 'cm')).toBe(25.4);
  });

  it('converts cm input back to inches', () => {
    expect(toInches(25.4, 'cm')).toBeCloseTo(10, 10);
  });

  it('round-trips inches -> cm -> inches within rounding', () => {
    const original = 34.5;
    const cm = toDisplay(original, 'cm');
    const back = round2(toInches(cm, 'cm'));
    expect(back).toBeCloseTo(original, 1);
  });

  it('round2 rounds to two decimals', () => {
    expect(round2(1.23456)).toBe(1.23);
    expect(round2(2.005)).toBe(2.01);
  });
});

describe('fieldState boundaries', () => {
  const field = { range: [30, 54] as [number, number] };

  it('is empty for undefined / null / NaN', () => {
    expect(fieldState(field, undefined)).toBe('empty');
    expect(fieldState(field, null)).toBe('empty');
    expect(fieldState(field, NaN)).toBe('empty');
  });

  it('is ok in range and on both bounds (inclusive)', () => {
    expect(fieldState(field, 40)).toBe('ok');
    expect(fieldState(field, 30)).toBe('ok');
    expect(fieldState(field, 54)).toBe('ok');
  });

  it('is out below min and above max', () => {
    expect(fieldState(field, 29.99)).toBe('out');
    expect(fieldState(field, 54.01)).toBe('out');
  });
});

describe('schema integrity', () => {
  it('lehenga has 13 fields, sherwani has 14', () => {
    expect(LEHENGA_FIELDS).toHaveLength(13);
    expect(SHERWANI_FIELDS).toHaveLength(14);
  });

  it('every field key is unique per garment', () => {
    for (const garment of ['lehenga', 'sherwani'] as const) {
      const keys = getMeasurementSchema(garment).map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('missingCount', () => {
  it('counts every field when nothing supplied', () => {
    expect(missingCount('lehenga', {})).toBe(13);
    expect(missingCount('sherwani', {})).toBe(14);
  });

  it('decrements as valid fields are filled', () => {
    expect(missingCount('lehenga', { around_bust: 36, hips: 40 })).toBe(11);
  });
});

describe('crossFieldWarnings — lehenga', () => {
  // A clean, internally-consistent set that should trip nothing.
  const clean = {
    around_bust: 36,
    around_above_waist: 32,
    hips: 42,
    lehenga_waist: 30,
    height: 65,
    lehenga_length: 42,
  };

  it('returns no warnings for a clean set', () => {
    expect(crossFieldWarnings('lehenga', clean)).toEqual([]);
  });

  it('warns when bust < rib band', () => {
    const w = crossFieldWarnings('lehenga', { ...clean, around_bust: 30, around_above_waist: 32 });
    expect(w).toContainEqual({
      level: 'warn',
      message: "Bust came out smaller than the rib band beneath it. That's unusual, so check both.",
    });
  });

  it('warns when hips < skirt waist', () => {
    const w = crossFieldWarnings('lehenga', { ...clean, hips: 29, lehenga_waist: 30 });
    expect(w).toContainEqual({
      level: 'warn',
      message: 'Hips are smaller than the skirt waist. Re-measure, hips are almost always larger.',
    });
  });

  it('warns when skirt length is long for height', () => {
    // ll > height * 0.78 => 65 * 0.78 = 50.7
    const w = crossFieldWarnings('lehenga', { ...clean, height: 65, lehenga_length: 52 });
    expect(w).toContainEqual({
      level: 'warn',
      message:
        'Skirt length is long for this height. Confirm you measured waist to floor, not head to floor.',
    });
  });

  it('warns when skirt length is short for height', () => {
    // ll < height * 0.5 => 65 * 0.5 = 32.5
    const w = crossFieldWarnings('lehenga', { ...clean, height: 65, lehenga_length: 30 });
    expect(w).toContainEqual({
      level: 'warn',
      message: 'Skirt length looks short for this height. Confirm it reaches the floor.',
    });
  });

  it('warns when waist very small next to hips', () => {
    // lw/hips < 0.55 => with hips 42, lw < 23.1
    const w = crossFieldWarnings('lehenga', { ...clean, hips: 42, lehenga_waist: 22 });
    expect(w).toContainEqual({
      level: 'warn',
      message: 'Waist is very small next to the hips. Worth measuring again.',
    });
  });
});

describe('crossFieldWarnings — sherwani', () => {
  const clean = {
    chest: 42,
    waist: 36,
    seat: 42,
    trouser_waist: 34,
    height: 70,
    sherwani_length: 46,
    inseam: 32,
  };

  it('returns no warnings for a clean set', () => {
    expect(crossFieldWarnings('sherwani', clean)).toEqual([]);
  });

  it('warns when waist > chest', () => {
    const w = crossFieldWarnings('sherwani', { ...clean, chest: 40, waist: 44 });
    expect(w).toContainEqual({
      level: 'warn',
      message: 'Waist larger than the chest is unusual for a sherwani. Double-check both.',
    });
  });

  it('warns when seat < trouser waist', () => {
    const w = crossFieldWarnings('sherwani', { ...clean, seat: 32, trouser_waist: 34 });
    expect(w).toContainEqual({
      level: 'warn',
      message: 'Seat smaller than the trouser waist is unusual. Re-measure the seat.',
    });
  });

  it('warns when sherwani length is long for height', () => {
    // sl > height * 0.72 => 70 * 0.72 = 50.4
    const w = crossFieldWarnings('sherwani', { ...clean, height: 70, sherwani_length: 52 });
    expect(w).toContainEqual({
      level: 'warn',
      message: 'Sherwani length is long for this height. Confirm shoulder to hem, not head to hem.',
    });
  });

  it('warns when inseam is long for height', () => {
    // ins > height * 0.55 => 70 * 0.55 = 38.5
    const w = crossFieldWarnings('sherwani', { ...clean, height: 70, inseam: 40 });
    expect(w).toContainEqual({
      level: 'warn',
      message: 'Inseam looks long for this height. Confirm crotch to ankle.',
    });
  });

  it('warns on a big chest-waist drop', () => {
    // chest - waist > 16
    const w = crossFieldWarnings('sherwani', { ...clean, chest: 50, waist: 30 });
    expect(w).toContainEqual({
      level: 'warn',
      message: "Big gap between chest and waist. Fine if that's the build, worth confirming.",
    });
  });

  it('ignores unset fields (nulls do not trip checks)', () => {
    expect(crossFieldWarnings('sherwani', { chest: 42 })).toEqual([]);
  });
});
