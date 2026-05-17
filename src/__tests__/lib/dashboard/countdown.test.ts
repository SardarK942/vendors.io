import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { countdown } from '@/lib/dashboard/countdown';

const NOW = new Date('2026-08-01T12:00:00Z');

describe('countdown', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns "Past" for past dates', () => {
    expect(countdown('2026-07-30')).toBe('Past');
  });

  it('returns "today" for today', () => {
    expect(countdown('2026-08-01')).toBe('today');
  });

  it('returns "tomorrow" for tomorrow', () => {
    expect(countdown('2026-08-02')).toBe('tomorrow');
  });

  it('returns Nd for 2-6 days', () => {
    expect(countdown('2026-08-04')).toBe('3d');
    expect(countdown('2026-08-07')).toBe('6d');
  });

  it('returns Nw for 1-4 weeks', () => {
    expect(countdown('2026-08-08')).toBe('1w');
    expect(countdown('2026-08-22')).toBe('3w');
  });

  it('returns Nmo for ~1-12 months', () => {
    expect(countdown('2026-09-15')).toBe('1mo');
    expect(countdown('2027-02-01')).toBe('6mo');
  });

  it('returns Ny for 1+ years out', () => {
    expect(countdown('2027-08-01')).toBe('1y');
  });
});
