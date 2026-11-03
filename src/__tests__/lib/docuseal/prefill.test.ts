import { describe, expect, test } from 'vitest';
import { formatAgreedPrice, formatEventSchedule, prefillSchema } from '@/lib/docuseal/prefill';

describe('formatEventSchedule', () => {
  test('renders multi-function events ordered by date', () => {
    const out = formatEventSchedule([
      { eventType: 'walima', eventDate: '2026-05-03' },
      { eventType: 'mehndi', eventDate: '2026-05-01' },
      { eventType: 'wedding', eventDate: '2026-05-02' },
    ]);
    const lines = out.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('Mehndi / Henna — May 1, 2026');
    expect(lines[1]).toBe('Wedding / Shaadi — May 2, 2026');
    expect(lines[2]).toBe('Walima / Wedding Feast — May 3, 2026');
  });

  test('renders a single-function booking as one line', () => {
    expect(formatEventSchedule([{ eventType: 'reception', eventDate: '2026-12-31' }])).toBe(
      'Reception — Dec 31, 2026'
    );
  });

  test('falls back to title-case for unknown event types', () => {
    expect(formatEventSchedule([{ eventType: 'garden_party', eventDate: '2026-01-05' }])).toBe(
      'Garden Party — Jan 5, 2026'
    );
  });
});

describe('formatAgreedPrice', () => {
  test('formats cents to USD', () => {
    expect(formatAgreedPrice(250000)).toBe('$2,500.00');
  });
});

describe('prefillSchema', () => {
  const valid = { agreedPrice: '$1.00', eventSchedule: 'x', coupleName: 'A', vendorName: 'B' };
  test('accepts valid values', () => {
    expect(prefillSchema.safeParse(valid).success).toBe(true);
  });
  test('rejects empty agreedPrice / eventSchedule', () => {
    expect(prefillSchema.safeParse({ ...valid, agreedPrice: '' }).success).toBe(false);
    expect(prefillSchema.safeParse({ ...valid, eventSchedule: '' }).success).toBe(false);
  });
});
