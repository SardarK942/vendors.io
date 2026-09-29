/**
 * Made-to-measure measurement validation (pure, deterministic, unit-testable).
 *
 * Unit conversion, per-field range state, and the cross-field sanity checks
 * ported verbatim from the prototype scratchpad/measure-modal.html per-garment
 * `cross()` functions. All values handled here are canonical INCHES; cm is a
 * display-only conversion. Messages match the prototype exactly (no em dashes).
 *
 * Pairs with src/lib/products/measurement-schemas.ts (the field taxonomy).
 */

import type { MeasurementGarment, MeasurementUnit } from '@/types/database.types';
import { getMeasurementSchema } from './measurement-schemas';

/** Inches → centimetres factor (prototype IN2CM). */
export const IN2CM = 2.54;

/** Round to 2 decimals (prototype `round`). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Convert a value entered in `unit` back to canonical inches. */
export function toInches(v: number, unit: MeasurementUnit): number {
  return unit === 'cm' ? v / IN2CM : v;
}

/** Convert a canonical-inches value to the display `unit`. */
export function toDisplay(v: number, unit: MeasurementUnit): number {
  return unit === 'cm' ? round2(v * IN2CM) : v;
}

export type FieldState = 'empty' | 'ok' | 'out';

/**
 * Range state for a single field given its value in canonical inches. Mirrors
 * the prototype `rangeState`: empty when undefined/NaN, out when below min or
 * above max, ok otherwise.
 */
export function fieldState(
  field: { range: [number, number] },
  valueInInches: number | null | undefined
): FieldState {
  if (valueInInches === undefined || valueInInches === null || Number.isNaN(valueInInches)) {
    return 'empty';
  }
  if (valueInInches < field.range[0] || valueInInches > field.range[1]) return 'out';
  return 'ok';
}

export interface CrossFieldWarning {
  level: 'warn';
  message: string;
}

/**
 * Cross-field sanity warnings. Ported from the prototype per-garment `cross(g)`
 * functions where `g(key)` returns the inches value or null when unset. Values
 * passed in are canonical inches. Messages are identical to the prototype.
 */
export function crossFieldWarnings(
  garment: MeasurementGarment,
  valuesInInches: Record<string, number | null | undefined>
): CrossFieldWarning[] {
  const g = (key: string): number | null => {
    const x = valuesInInches[key];
    if (x === undefined || x === null || Number.isNaN(x)) return null;
    return x;
  };
  const warn = (message: string): CrossFieldWarning => ({ level: 'warn', message });
  const out: CrossFieldWarning[] = [];

  if (garment === 'lehenga') {
    const bust = g('around_bust');
    const uw = g('around_above_waist');
    const hips = g('hips');
    const lw = g('lehenga_waist');
    const ht = g('height');
    const ll = g('lehenga_length');

    if (bust !== null && uw !== null && bust < uw) {
      out.push(
        warn("Bust came out smaller than the rib band beneath it. That's unusual, so check both.")
      );
    }
    if (hips !== null && lw !== null && hips < lw) {
      out.push(
        warn('Hips are smaller than the skirt waist. Re-measure, hips are almost always larger.')
      );
    }
    if (ht !== null && ll !== null && ll > ht * 0.78) {
      out.push(
        warn(
          'Skirt length is long for this height. Confirm you measured waist to floor, not head to floor.'
        )
      );
    }
    if (ht !== null && ll !== null && ll < ht * 0.5) {
      out.push(warn('Skirt length looks short for this height. Confirm it reaches the floor.'));
    }
    if (hips !== null && lw !== null && hips > 0 && lw / hips < 0.55) {
      out.push(warn('Waist is very small next to the hips. Worth measuring again.'));
    }
    return out;
  }

  // sherwani
  const chest = g('chest');
  const waist = g('waist');
  const seat = g('seat');
  const tw = g('trouser_waist');
  const ht = g('height');
  const sl = g('sherwani_length');
  const ins = g('inseam');

  if (chest !== null && waist !== null && waist > chest) {
    out.push(warn('Waist larger than the chest is unusual for a sherwani. Double-check both.'));
  }
  if (seat !== null && tw !== null && seat < tw) {
    out.push(warn('Seat smaller than the trouser waist is unusual. Re-measure the seat.'));
  }
  if (ht !== null && sl !== null && sl > ht * 0.72) {
    out.push(
      warn('Sherwani length is long for this height. Confirm shoulder to hem, not head to hem.')
    );
  }
  if (ht !== null && ins !== null && ins > ht * 0.55) {
    out.push(warn('Inseam looks long for this height. Confirm crotch to ankle.'));
  }
  if (chest !== null && waist !== null && chest - waist > 16) {
    out.push(warn("Big gap between chest and waist. Fine if that's the build, worth confirming."));
  }
  return out;
}

/**
 * How many of the garment's fields are still empty. Values are canonical
 * inches; missing/NaN counts as empty (mirrors the prototype review count).
 */
export function missingCount(
  garment: MeasurementGarment,
  values: Record<string, number | null | undefined>
): number {
  return getMeasurementSchema(garment).filter(
    (field) => fieldState(field, values[field.key]) === 'empty'
  ).length;
}
