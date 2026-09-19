/**
 * snapTimeToQuarterHour — rounds an HH:mm 24h string to the nearest 15 min.
 */
import { describe, it, expect } from 'vitest';
import { snapTimeToQuarterHour } from '@/lib/time';

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
