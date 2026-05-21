import { describe, it, expect } from 'vitest';
import { computeIpHash } from '@/lib/analytics/ip-hash';

describe('computeIpHash', () => {
  it('returns a 64-char hex string (sha256)', () => {
    const h = computeIpHash('1.2.3.4');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns the same hash for the same IP on the same UTC day', () => {
    const day = new Date('2026-05-20T12:00:00Z');
    expect(computeIpHash('1.2.3.4', day)).toBe(computeIpHash('1.2.3.4', day));
  });

  it('returns a different hash on a different UTC day (daily salt)', () => {
    const day1 = new Date('2026-05-20T12:00:00Z');
    const day2 = new Date('2026-05-21T12:00:00Z');
    expect(computeIpHash('1.2.3.4', day1)).not.toBe(computeIpHash('1.2.3.4', day2));
  });

  it('returns different hashes for different IPs', () => {
    const day = new Date('2026-05-20T12:00:00Z');
    expect(computeIpHash('1.2.3.4', day)).not.toBe(computeIpHash('5.6.7.8', day));
  });

  it('treats times within the same UTC day as identical (uses date only, not time)', () => {
    const morning = new Date('2026-05-20T00:01:00Z');
    const evening = new Date('2026-05-20T23:59:00Z');
    expect(computeIpHash('1.2.3.4', morning)).toBe(computeIpHash('1.2.3.4', evening));
  });
});
