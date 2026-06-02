import { describe, expect, it } from 'vitest';
import { generateScrapedVendorSlug } from '../../../../scripts/scraper/lib/slug';

const FAKE_ID = '11111111-2222-3333-4444-555555555555';

describe('generateScrapedVendorSlug', () => {
  it('lowercases + dash-joins business name + appends 6-char UUID suffix', () => {
    expect(generateScrapedVendorSlug('Best Chai Cart', FAKE_ID)).toBe('best-chai-cart-111111');
  });

  it('strips special chars and collapses repeats', () => {
    expect(generateScrapedVendorSlug("Priya's Mehndi & Henna!", FAKE_ID)).toBe(
      'priya-s-mehndi-henna-111111'
    );
  });

  it('trims leading + trailing dashes the regex produces', () => {
    expect(generateScrapedVendorSlug('  !!Chai!! ', FAKE_ID)).toBe('chai-111111');
  });

  it('falls back to just the suffix when business name has no alphanumerics', () => {
    expect(generateScrapedVendorSlug('!@#$%', FAKE_ID)).toBe('111111');
  });

  it('uses lowercase hex chars from the UUID suffix', () => {
    expect(generateScrapedVendorSlug('X', 'abcdef12-3456-7890-abcd-ef1234567890')).toBe('x-abcdef');
  });
});
