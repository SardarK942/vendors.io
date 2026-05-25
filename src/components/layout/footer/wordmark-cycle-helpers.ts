/**
 * Pure helpers for the WordmarkCycle component. Kept isolated from the React
 * component so the rotation order + script metadata are testable without DOM
 * or React internals.
 */

export type WordmarkScriptKey = 'deva' | 'nastaliq' | 'naskh' | 'persian';

export interface WordmarkScript {
  key: WordmarkScriptKey;
  /** The word "baazar" rendered in this script's native glyphs. */
  glyph: string;
  /** CSS font-family stack referencing the next/font variable from src/app/layout.tsx. */
  cssFamily: string;
  /** Screen-reader description for the script (currently unused — outer h2 carries the label). */
  a11yLabel: string;
  /** Per-script font-size multiplier vs the base wordmark size. Nastaliq is shorter so renders bigger visually at the same size. */
  scaleMultiplier: number;
}

export const WORDMARK_SCRIPTS: readonly WordmarkScript[] = [
  {
    key: 'deva',
    glyph: 'बाज़ार',
    cssFamily: 'var(--font-wordmark-deva), serif',
    a11yLabel: 'Hindi (Devanagari)',
    scaleMultiplier: 1,
  },
  {
    key: 'nastaliq',
    glyph: 'بازار',
    cssFamily: 'var(--font-wordmark-nastaliq), serif',
    a11yLabel: 'Urdu (Nastaliq)',
    scaleMultiplier: 0.85,
  },
  {
    key: 'naskh',
    glyph: 'بازار',
    cssFamily: 'var(--font-wordmark-naskh), serif',
    a11yLabel: 'Arabic (Naskh)',
    scaleMultiplier: 1,
  },
  {
    key: 'persian',
    glyph: 'بازار',
    cssFamily: 'var(--font-wordmark-persian), serif',
    a11yLabel: 'Persian / Farsi',
    scaleMultiplier: 1,
  },
];

export function nextScriptIndex(current: number): number {
  return (current + 1) % WORDMARK_SCRIPTS.length;
}
