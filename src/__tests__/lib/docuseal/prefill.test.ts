import { describe, expect, test } from 'vitest';
import { formatAgreedPrice, formatEventSchedule, prefillSchema } from '@/lib/docuseal/prefill';

describe('formatEventSchedule', () => {
  // Production input is booking_events.event_type_label: a human label or free text, not an id.
  test('renders multi-function events ordered by date, labels passed through', () => {
    const out = formatEventSchedule([
      { eventType: 'Walima / Wedding Feast', eventDate: '2026-05-03' },
      { eventType: 'Mehndi / Henna', eventDate: '2026-05-01' },
      { eventType: 'Wedding / Shaadi', eventDate: '2026-05-02' },
    ]);
    const lines = out.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('Mehndi / Henna — May 1, 2026');
    expect(lines[1]).toBe('Wedding / Shaadi — May 2, 2026');
    expect(lines[2]).toBe('Walima / Wedding Feast — May 3, 2026');
  });

  test('renders a single-function booking as one line', () => {
    expect(formatEventSchedule([{ eventType: 'Haldi', eventDate: '2026-12-31' }])).toBe(
      'Haldi — Dec 31, 2026'
    );
  });

  test('passes free-text labels through unchanged', () => {
    expect(
      formatEventSchedule([
        { eventType: "Sangeet & Dinner (Priya's side)", eventDate: '2026-01-05' },
      ])
    ).toBe("Sangeet & Dinner (Priya's side) — Jan 5, 2026");
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
