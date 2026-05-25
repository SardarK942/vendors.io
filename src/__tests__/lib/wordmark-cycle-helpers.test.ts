import { describe, it, expect } from 'vitest';
import {
  WORDMARK_SCRIPTS,
  nextScriptIndex,
} from '@/components/layout/footer/wordmark-cycle-helpers';

describe('WORDMARK_SCRIPTS', () => {
  it('has four scripts in fixed order: deva → nastaliq → naskh → persian', () => {
    expect(WORDMARK_SCRIPTS.map((s) => s.key)).toEqual(['deva', 'nastaliq', 'naskh', 'persian']);
  });

  it('each script has glyph + cssFamily + a11yLabel', () => {
    for (const s of WORDMARK_SCRIPTS) {
      expect(typeof s.glyph).toBe('string');
      expect(s.glyph.length).toBeGreaterThan(0);
      expect(typeof s.cssFamily).toBe('string');
      expect(typeof s.a11yLabel).toBe('string');
    }
  });

  it('uses the Devanagari font variable for deva', () => {
    const deva = WORDMARK_SCRIPTS.find((s) => s.key === 'deva');
    expect(deva?.cssFamily).toContain('--font-wordmark-deva');
  });
});

describe('nextScriptIndex', () => {
  it('loops 0 → 1 → 2 → 3 → 0', () => {
    expect(nextScriptIndex(0)).toBe(1);
    expect(nextScriptIndex(1)).toBe(2);
    expect(nextScriptIndex(2)).toBe(3);
    expect(nextScriptIndex(3)).toBe(0);
  });

  it('handles out-of-range index gracefully (modulo)', () => {
    expect(nextScriptIndex(4)).toBe(1);
    expect(nextScriptIndex(7)).toBe(0);
  });
});
