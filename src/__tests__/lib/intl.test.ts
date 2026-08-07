import { describe, it, expect } from 'vitest';
import { fmtDate, fmtDateTime, fmtTime, fmtRelative } from '@/lib/intl';

describe('fmtDate', () => {
  it('does not throw and returns empty string for invalid inputs', () => {
    expect(() => fmtDate('')).not.toThrow();
    expect(fmtDate('')).toBe('');

    expect(() => fmtDate('not-a-date')).not.toThrow();
    expect(fmtDate('not-a-date')).toBe('');

    // The real crash input: an empty eventDate interpolated into a template string
    const eventDate = '';
    expect(() => fmtDate(`${eventDate}T12:00:00`)).not.toThrow();
    expect(fmtDate(`${eventDate}T12:00:00`)).toBe('');

    expect(() => fmtDate(new Date('nope'))).not.toThrow();
    expect(fmtDate(new Date('nope'))).toBe('');
  });

  it('still formats valid inputs correctly', () => {
    // Noon local time avoids UTC/local timezone-boundary ambiguity for a date-only assertion.
    expect(fmtDate('2026-07-14T12:00:00')).toBe('Jul 14, 2026');
    expect(fmtDate(new Date('2026-07-14T12:00:00'))).toBe('Jul 14, 2026');
    expect(fmtDate('2026-07-14')).not.toBe('');
  });
});

describe('fmtDateTime', () => {
  it('returns empty string for invalid inputs instead of throwing', () => {
    expect(() => fmtDateTime('')).not.toThrow();
    expect(fmtDateTime('')).toBe('');
    expect(fmtDateTime('not-a-date')).toBe('');
    expect(fmtDateTime(new Date('nope'))).toBe('');
  });

  it('still formats valid inputs correctly', () => {
    expect(fmtDateTime('2026-07-14T12:00:00')).not.toBe('');
  });
});

describe('fmtTime', () => {
  it('returns empty string for invalid inputs instead of throwing', () => {
    expect(() => fmtTime('')).not.toThrow();
    expect(fmtTime('')).toBe('');
    expect(fmtTime('not-a-date')).toBe('');
    expect(fmtTime(new Date('nope'))).toBe('');
  });

  it('still formats valid inputs correctly', () => {
    expect(fmtTime('2026-07-14T12:00:00')).not.toBe('');
  });
});

describe('fmtRelative', () => {
  it('returns empty string for invalid inputs instead of throwing', () => {
    expect(() => fmtRelative('')).not.toThrow();
    expect(fmtRelative('')).toBe('');
    expect(fmtRelative('not-a-date')).toBe('');
    expect(fmtRelative(new Date('nope'))).toBe('');
  });

  it('still formats valid inputs correctly', () => {
    const now = new Date('2026-07-14T12:00:00Z');
    const twoHoursAgo = new Date('2026-07-14T10:00:00Z');
    expect(fmtRelative(twoHoursAgo, now)).toBe('2 hours ago');
  });
});
