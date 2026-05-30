import { describe, expect, it } from 'vitest';
import { dedupKey, candidatesEqual } from '../../../../scripts/scraper/lib/dedup';

describe('dedupKey', () => {
  it('prefers normalized IG handle when present', () => {
    expect(dedupKey({ instagram_handle: 'BestChai', business_name: 'X', city: 'Chicago' })).toBe(
      'ig:bestchai'
    );
  });

  it('falls back to phone when no IG', () => {
    expect(dedupKey({ phone: '+13125551234', business_name: 'X', city: 'Chicago' })).toBe(
      'phone:+13125551234'
    );
  });

  it('falls back to (name + city) when no IG, no phone', () => {
    expect(dedupKey({ business_name: 'Best Chai Cart', city: 'Chicago' })).toBe(
      'namecity:best chai cart|chicago'
    );
  });

  it('returns null when no signal present', () => {
    expect(dedupKey({})).toBeNull();
  });
});

describe('candidatesEqual', () => {
  it('treats exact IG match as same', () => {
    expect(
      candidatesEqual({ instagram_handle: 'bestchai' }, { instagram_handle: 'bestchai' })
    ).toBe(true);
  });

  it('rejects different IG handles', () => {
    expect(
      candidatesEqual({ instagram_handle: 'bestchai' }, { instagram_handle: 'worstchai' })
    ).toBe(false);
  });

  it('treats phone match as same when both present', () => {
    expect(candidatesEqual({ phone: '+13125551234' }, { phone: '+13125551234' })).toBe(true);
  });
});
