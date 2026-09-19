import { describe, it, expect } from 'vitest';
import { formatCapacity, formatPackageMeta } from '@/types';

describe('formatCapacity', () => {
  it('returns "" for a null value (archetype-hidden capacity, migration 00079)', () => {
    expect(formatCapacity(null, 'guests')).toBe('');
  });

  it('returns "" for an undefined value', () => {
    expect(formatCapacity(undefined, 'guests')).toBe('');
  });

  it('pluralizes for a real value', () => {
    expect(formatCapacity(200, 'guests')).toBe('up to 200 guests');
    expect(formatCapacity(300, 'servings')).toBe('up to 300 servings');
  });

  it('uses the singular unit word at N=1', () => {
    expect(formatCapacity(1, 'guests')).toBe('up to 1 guest');
    expect(formatCapacity(1, 'servings')).toBe('up to 1 serving');
  });
});

describe('formatPackageMeta', () => {
  it('joins all present segments with " · "', () => {
    expect(
      formatPackageMeta({
        durationHours: 8,
        maxGuests: 200,
        capacityUnit: 'guests',
        eventsCount: 3,
      })
    ).toBe('8 h · up to 200 guests · 3 events');
  });

  it('skips a null duration', () => {
    expect(formatPackageMeta({ durationHours: null, maxGuests: 200, capacityUnit: 'guests' })).toBe(
      'up to 200 guests'
    );
  });

  it('skips a null capacity', () => {
    expect(formatPackageMeta({ durationHours: 8, maxGuests: null, capacityUnit: 'guests' })).toBe(
      '8 h'
    );
  });

  it('omits the events segment when count is 1 or missing', () => {
    expect(
      formatPackageMeta({
        durationHours: 8,
        maxGuests: 200,
        capacityUnit: 'guests',
        eventsCount: 1,
      })
    ).toBe('8 h · up to 200 guests');
  });

  it('returns "" when every segment is null/hidden', () => {
    expect(
      formatPackageMeta({ durationHours: null, maxGuests: null, capacityUnit: 'guests' })
    ).toBe('');
  });
});
