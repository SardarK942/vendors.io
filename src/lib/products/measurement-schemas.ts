/**
 * Made-to-measure body-measurement field taxonomy (pure, no React/DOM).
 *
 * Single source of truth for WHICH numbers a buyer takes for each garment, the
 * how-to copy, typical ranges, and the SVG highlight geometry the future modal
 * (WS-2) draws on the body diagram. Ported verbatim from the vetted prototype
 * scratchpad/measure-modal.html (the LEHENGA / SHERWANI / GARMENTS arrays) so
 * the UI matches the prototype exactly.
 *
 * Values are canonically in INCHES (range bounds too); the cm display is a
 * conversion handled in measurement-validation.ts. Cross-field sanity checks
 * (the prototype's per-garment `cross()` fns) live in measurement-validation.ts,
 * not here, so this file stays data-only.
 *
 * Kept in sync with: MeasurementGarment in src/types/database.types.ts, the
 * garment CHECK in migration 00083, and measurementProfileSchema in
 * src/types/index.ts.
 */

import type { MeasurementGarment } from '@/types/database.types';

/** SVG highlight geometry drawn over the body diagram for a field. */
export type MeasurementHighlight =
  | { t: 'band'; cy: number; rx: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { t: 'point'; cx: number; cy: number; r: number };

export interface MeasurementField {
  /** Machine key — the jsonb key measurements are stored under (inches). */
  key: string;
  /** Group heading in the index / review views. */
  group: string;
  /** Human label. */
  name: string;
  /** How-to instructions. */
  how: string;
  /** Typical [min, max] in inches. */
  range: [number, number];
  /** Canonical storage unit — always inches. */
  unit: 'in';
  /** Measured across the back (shows an "across the back" hint). */
  back?: boolean;
  /** Easy to get wrong — surfaces a "measure it twice" nudge. */
  tricky?: boolean;
  /** Optional quick-pick presets: [label, inches]. */
  presets?: [string, number][];
  /** SVG highlight geometry. */
  hi: MeasurementHighlight;
}

/** Per-garment display meta (mirrors the prototype GARMENTS meta, minus cross). */
export interface GarmentMeta {
  /** Tab / picker label. */
  label: string;
  /** Noun used in headlines ("a {noun} that fits"). */
  noun: string;
  /** Which body figure the diagram renders. */
  figure: 'female' | 'male';
}

// ─── Lehenga (bride) — 13 fields ────────────────────────────────────────────

export const LEHENGA_FIELDS: MeasurementField[] = [
  {
    key: 'around_bust',
    group: 'Blouse (choli)',
    name: 'Around bust',
    how: 'Wrap the tape around the fullest part of the bust, level with the floor. Wear a well-fitting, non-padded bra, stand relaxed, and breathe normally.',
    range: [30, 54],
    unit: 'in',
    hi: { t: 'band', cy: 104, rx: 34 },
  },
  {
    key: 'around_above_waist',
    group: 'Blouse (choli)',
    name: 'Above waist (rib band)',
    how: 'Measure the rib band just under the bust, snug but not tight. This is where the blouse closes.',
    range: [26, 48],
    unit: 'in',
    hi: { t: 'band', cy: 128, rx: 29 },
  },
  {
    key: 'shoulder_width',
    group: 'Blouse (choli)',
    name: 'Shoulder width',
    back: true,
    tricky: true,
    how: 'Measure straight across the upper back, from the tip of one shoulder to the other. Easiest with a helper while you stand naturally.',
    range: [13, 17],
    unit: 'in',
    hi: { t: 'line', x1: 78, y1: 80, x2: 142, y2: 80 },
  },
  {
    key: 'around_armhole',
    group: 'Blouse (choli)',
    name: 'Armhole',
    how: 'Loop the tape around the shoulder joint where a sleeve seam would sit. Leave a finger of slack.',
    range: [14, 20],
    unit: 'in',
    hi: { t: 'point', cx: 80, cy: 92, r: 12 },
  },
  {
    key: 'around_arm',
    group: 'Blouse (choli)',
    name: 'Arm (bicep)',
    how: 'Measure around the fullest part of the upper arm, kept relaxed at the side.',
    range: [9, 18],
    unit: 'in',
    hi: { t: 'point', cx: 70, cy: 120, r: 9 },
  },
  {
    key: 'sleeve_length',
    group: 'Blouse (choli)',
    name: 'Sleeve length',
    tricky: true,
    how: 'From the shoulder tip down the outside of the arm to where the sleeve should end. Pick a style below, or type your own.',
    range: [0, 24],
    unit: 'in',
    hi: { t: 'line', x1: 78, y1: 82, x2: 66, y2: 176 },
    presets: [
      ['Sleeveless', 0],
      ['Cap', 5],
      ['Elbow', 10],
      ['¾', 16],
      ['Full', 23],
    ],
  },
  {
    key: 'choli_length',
    group: 'Blouse (choli)',
    name: 'Blouse length',
    tricky: true,
    how: 'From the shoulder tip straight down to where the blouse should end, usually just above the natural waist.',
    range: [13, 18],
    unit: 'in',
    hi: { t: 'line', x1: 110, y1: 66, x2: 110, y2: 168 },
  },
  {
    key: 'front_neck_depth',
    group: 'Blouse (choli)',
    name: 'Front neck depth',
    how: 'From the base of the neck down the front to where the neckline should sit.',
    range: [5, 12],
    unit: 'in',
    hi: { t: 'line', x1: 110, y1: 66, x2: 110, y2: 100 },
  },
  {
    key: 'back_neck_depth',
    group: 'Blouse (choli)',
    name: 'Back neck depth',
    back: true,
    how: 'From the base of the neck down the back to the neckline you want.',
    range: [5, 15],
    unit: 'in',
    hi: { t: 'line', x1: 110, y1: 66, x2: 110, y2: 106 },
  },
  {
    key: 'lehenga_waist',
    group: 'Skirt (lehenga)',
    name: 'Skirt waist',
    how: "Measure where the skirt will sit, at the natural waist or just below. Breathe normally, don't suck in.",
    range: [22, 48],
    unit: 'in',
    hi: { t: 'band', cy: 168, rx: 26 },
  },
  {
    key: 'hips',
    group: 'Skirt (lehenga)',
    name: 'Hips',
    how: 'Around the fullest part of the hips and seat, keeping the tape level with the floor.',
    range: [34, 55],
    unit: 'in',
    hi: { t: 'band', cy: 196, rx: 32 },
  },
  {
    key: 'lehenga_length',
    group: 'Skirt (lehenga)',
    name: 'Skirt length',
    tricky: true,
    how: 'From the waist down to the floor, wearing the heels for the day. This is the one brides get wrong most.',
    range: [40, 46],
    unit: 'in',
    hi: { t: 'line', x1: 150, y1: 172, x2: 150, y2: 366 },
  },
  {
    key: 'height',
    group: 'Overall',
    name: 'Height',
    how: 'Head to heel, standing straight against a wall, no shoes.',
    range: [58, 74],
    unit: 'in',
    hi: { t: 'line', x1: 150, y1: 24, x2: 150, y2: 368 },
  },
];

// ─── Sherwani (groom) — 14 fields ───────────────────────────────────────────

export const SHERWANI_FIELDS: MeasurementField[] = [
  {
    key: 'neck',
    group: 'Sherwani (coat)',
    name: 'Neck',
    how: 'Around the base of the neck where a collar sits, with a finger of room.',
    range: [13.5, 19],
    unit: 'in',
    hi: { t: 'band', cy: 58, rx: 13 },
  },
  {
    key: 'full_shoulder',
    group: 'Sherwani (coat)',
    name: 'Shoulder width',
    back: true,
    tricky: true,
    how: 'Straight across the back from one shoulder tip to the other. Best measured by a helper.',
    range: [16, 21],
    unit: 'in',
    hi: { t: 'line', x1: 72, y1: 80, x2: 148, y2: 80 },
  },
  {
    key: 'chest',
    group: 'Sherwani (coat)',
    name: 'Chest',
    how: 'Around the fullest part of the chest, tape level, arms relaxed. This drives the size.',
    range: [32, 56],
    unit: 'in',
    hi: { t: 'band', cy: 105, rx: 40 },
  },
  {
    key: 'stomach',
    group: 'Sherwani (coat)',
    name: 'Stomach',
    how: 'Around the belly at its fullest, standing naturally without holding it in.',
    range: [28, 52],
    unit: 'in',
    hi: { t: 'band', cy: 145, rx: 36 },
  },
  {
    key: 'waist',
    group: 'Sherwani (coat)',
    name: 'Waist',
    how: 'Around the natural waist, where the sherwani nips in.',
    range: [28, 50],
    unit: 'in',
    hi: { t: 'band', cy: 168, rx: 34 },
  },
  {
    key: 'seat',
    group: 'Sherwani (coat)',
    name: 'Seat (hips)',
    how: 'Around the fullest part of the seat, tape level with the floor.',
    range: [34, 54],
    unit: 'in',
    hi: { t: 'band', cy: 196, rx: 36 },
  },
  {
    key: 'sleeve_length',
    group: 'Sherwani (coat)',
    name: 'Sleeve length',
    tricky: true,
    how: 'From the shoulder tip down the outside of the arm to the wrist bone, arm slightly bent.',
    range: [20, 28],
    unit: 'in',
    hi: { t: 'line', x1: 74, y1: 82, x2: 62, y2: 194 },
  },
  {
    key: 'bicep',
    group: 'Sherwani (coat)',
    name: 'Bicep',
    how: 'Around the fullest part of the upper arm, relaxed at the side.',
    range: [10, 20],
    unit: 'in',
    hi: { t: 'point', cx: 64, cy: 118, r: 10 },
  },
  {
    key: 'wrist',
    group: 'Sherwani (coat)',
    name: 'Wrist',
    how: 'Around the wrist bone where the cuff closes.',
    range: [6, 9],
    unit: 'in',
    hi: { t: 'point', cx: 63, cy: 194, r: 6 },
  },
  {
    key: 'sherwani_length',
    group: 'Sherwani (coat)',
    name: 'Sherwani length',
    tricky: true,
    how: 'From the shoulder tip straight down to where the sherwani should end, usually below the knee.',
    range: [38, 52],
    unit: 'in',
    hi: { t: 'line', x1: 158, y1: 80, x2: 158, y2: 300 },
  },
  {
    key: 'trouser_waist',
    group: 'Churidar / trousers',
    name: 'Trouser waist',
    how: 'Around where the churidar or trousers sit at the waist.',
    range: [28, 48],
    unit: 'in',
    hi: { t: 'band', cy: 172, rx: 34 },
  },
  {
    key: 'inseam',
    group: 'Churidar / trousers',
    name: 'Inseam',
    tricky: true,
    how: 'From the crotch straight down the inner leg to the ankle bone.',
    range: [26, 36],
    unit: 'in',
    hi: { t: 'line', x1: 118, y1: 302, x2: 118, y2: 366 },
  },
  {
    key: 'trouser_length',
    group: 'Churidar / trousers',
    name: 'Trouser length',
    how: 'From the waist down the outside of the leg to the ankle.',
    range: [36, 44],
    unit: 'in',
    hi: { t: 'line', x1: 160, y1: 172, x2: 160, y2: 366 },
  },
  {
    key: 'height',
    group: 'Overall',
    name: 'Height',
    how: 'Head to heel, standing straight against a wall, no shoes.',
    range: [60, 78],
    unit: 'in',
    hi: { t: 'line', x1: 172, y1: 22, x2: 172, y2: 372 },
  },
];

export const MEASUREMENT_SCHEMAS: Record<MeasurementGarment, MeasurementField[]> = {
  lehenga: LEHENGA_FIELDS,
  sherwani: SHERWANI_FIELDS,
};

export const GARMENT_META: Record<MeasurementGarment, GarmentMeta> = {
  lehenga: { label: 'Bride · Lehenga', noun: 'lehenga', figure: 'female' },
  sherwani: { label: 'Groom · Sherwani', noun: 'sherwani', figure: 'male' },
};

export function getMeasurementSchema(garment: MeasurementGarment): MeasurementField[] {
  return MEASUREMENT_SCHEMAS[garment];
}
