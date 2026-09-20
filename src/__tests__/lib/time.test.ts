/**
 * snapTimeToQuarterHour — rounds an HH:mm 24h string to the nearest 15 min.
 */
import { describe, it, expect } from 'vitest';
import { snapTimeToQuarterHour, to12h, QUARTER_HOUR_SLOTS } from '@/lib/time';

describe('snapTimeToQuarterHour', () => {
  it('leaves on-grid values unchanged', () => {
    expect(snapTimeToQuarterHour('09:00')).toBe('09:00');
    expect(snapTimeToQuarterHour('09:15')).toBe('09:15');
    expect(snapTimeToQuarterHour('09:30')).toBe('09:30');
    expect(snapTimeToQuarterHour('09:45')).toBe('09:45');
  });

  it('rounds down when nearer the lower quarter', () => {
    expect(snapTimeToQuarterHour('09:07')).toBe('09:00');
    expect(snapTimeToQuarterHour('09:22')).toBe('09:15');
  });

  it('rounds up when nearer the higher quarter', () => {
    expect(snapTimeToQuarterHour('09:08')).toBe('09:15');
    expect(snapTimeToQuarterHour('09:23')).toBe('09:30');
    expect(snapTimeToQuarterHour('09:52')).toBe('09:45');
  });

  it('rolls 53-59 up into the next hour', () => {
    expect(snapTimeToQuarterHour('09:53')).toBe('10:00');
    expect(snapTimeToQuarterHour('10:53')).toBe('11:00');
  });

  it('clamps at the last hour so it never rolls past 23:59 into the next day', () => {
    expect(snapTimeToQuarterHour('23:53')).toBe('23:00');
  });

  it('returns empty string unchanged', () => {
    expect(snapTimeToQuarterHour('')).toBe('');
  });

  it('returns malformed input unchanged', () => {
    expect(snapTimeToQuarterHour('abc')).toBe('abc');
    expect(snapTimeToQuarterHour('99:99')).toBe('99:99');
    expect(snapTimeToQuarterHour('9:5')).toBe('9:5');
  });
});

describe('to12h', () => {
  it('formats afternoon/evening times with PM', () => {
    expect(to12h('16:00')).toBe('4:00 PM');
    expect(to12h('23:45')).toBe('11:45 PM');
    expect(to12h('12:30')).toBe('12:30 PM');
  });

  it('formats morning times with AM', () => {
    expect(to12h('09:00')).toBe('9:00 AM');
    expect(to12h('11:15')).toBe('11:15 AM');
  });

  it('handles the midnight and noon boundaries', () => {
    expect(to12h('00:00')).toBe('12:00 AM');
    expect(to12h('00:15')).toBe('12:15 AM');
    expect(to12h('12:00')).toBe('12:00 PM');
  });

  it('returns empty string for empty, malformed, or out-of-range input', () => {
    expect(to12h('')).toBe('');
    expect(to12h('abc')).toBe('');
    expect(to12h('9:5')).toBe('');
    expect(to12h('99:99')).toBe('');
    expect(to12h('24:00')).toBe('');
  });
});

describe('QUARTER_HOUR_SLOTS', () => {
  it('has 96 slots spanning the full day in 15-min steps', () => {
    expect(QUARTER_HOUR_SLOTS).toHaveLength(96);
    expect(QUARTER_HOUR_SLOTS[0]).toEqual({ value: '00:00', label: '12:00 AM' });
    expect(QUARTER_HOUR_SLOTS[95]).toEqual({ value: '23:45', label: '11:45 PM' });
  });

  it('advances by exactly 15 minutes with matching 12h labels', () => {
    expect(QUARTER_HOUR_SLOTS[1]).toEqual({ value: '00:15', label: '12:15 AM' });
    // 16:00 == 4:00 PM sits at index 64 (16 hours * 4 slots/hour).
    expect(QUARTER_HOUR_SLOTS[64]).toEqual({ value: '16:00', label: '4:00 PM' });
  });

  it('label always equals to12h(value)', () => {
    for (const slot of QUARTER_HOUR_SLOTS) {
      expect(slot.label).toBe(to12h(slot.value));
    }
  });
});
