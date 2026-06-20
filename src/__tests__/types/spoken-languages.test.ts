import { describe, it, expect } from 'vitest';
import { SPOKEN_LANGUAGES } from '@/types';

describe('SPOKEN_LANGUAGES', () => {
  it('includes Spanish', () => {
    expect(SPOKEN_LANGUAGES).toContain('Spanish');
  });

  it('includes the previously locked languages', () => {
    // Existing entries from src/components/marketplace/filters/constants.ts
    expect(SPOKEN_LANGUAGES).toContain('Hindi');
    expect(SPOKEN_LANGUAGES).toContain('Urdu');
    expect(SPOKEN_LANGUAGES).toContain('Punjabi');
    expect(SPOKEN_LANGUAGES).toContain('Bengali');
    expect(SPOKEN_LANGUAGES).toContain('Gujarati');
    expect(SPOKEN_LANGUAGES).toContain('Tamil');
    expect(SPOKEN_LANGUAGES).toContain('Telugu');
    expect(SPOKEN_LANGUAGES).toContain('Marathi');
    expect(SPOKEN_LANGUAGES).toContain('Arabic');
    expect(SPOKEN_LANGUAGES).toContain('English');
  });

  it('has no duplicates', () => {
    const set = new Set(SPOKEN_LANGUAGES);
    expect(set.size).toBe(SPOKEN_LANGUAGES.length);
  });
});
