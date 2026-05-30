import { describe, expect, it } from 'vitest';
import {
  mintTokenString,
  hashTokenString,
  parseTokenString,
} from '../../../../scripts/scraper/lib/claim-token';

const FAKE_VENDOR_ID = '11111111-2222-3333-4444-555555555555';

describe('claim token', () => {
  it('mintTokenString produces a token containing the vendor id', () => {
    const token = mintTokenString(FAKE_VENDOR_ID);
    const parsed = parseTokenString(token);
    expect(parsed?.scrapedVendorId).toBe(FAKE_VENDOR_ID);
  });

  it('mintTokenString embeds 64 random bytes (different each call)', () => {
    const a = mintTokenString(FAKE_VENDOR_ID);
    const b = mintTokenString(FAKE_VENDOR_ID);
    expect(a).not.toBe(b);
  });

  it('hashTokenString returns SHA-256 hex of the token', () => {
    const token = mintTokenString(FAKE_VENDOR_ID);
    const hash = hashTokenString(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    // Same token → same hash
    expect(hashTokenString(token)).toBe(hash);
  });

  it('parseTokenString returns null for malformed input', () => {
    expect(parseTokenString('not-a-token')).toBeNull();
    expect(parseTokenString('')).toBeNull();
    expect(parseTokenString('abc:def:ghi')).toBeNull();
  });
});
