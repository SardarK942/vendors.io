import { describe, it, expect } from 'vitest';
import {
  customRequestSchema,
  EVENT_TYPES,
  type EventType,
} from '@/lib/booking/custom-request-validation';

const VALID_INPUT = {
  vendor_slug: 'henna-by-anya',
  event_date: '2026-10-17',
  guest_count: 150,
  event_type: 'mehndi' as EventType,
  description: 'a'.repeat(120),
};

describe('customRequestSchema', () => {
  it('accepts a valid request', () => {
    const r = customRequestSchema.safeParse(VALID_INPUT);
    expect(r.success).toBe(true);
  });

  it('rejects missing vendor_slug', () => {
    const r = customRequestSchema.safeParse({ ...VALID_INPUT, vendor_slug: '' });
    expect(r.success).toBe(false);
  });

  it('rejects malformed event_date', () => {
    const r = customRequestSchema.safeParse({ ...VALID_INPUT, event_date: '10/17/2026' });
    expect(r.success).toBe(false);
  });

  it('rejects guest_count < 1', () => {
    const r = customRequestSchema.safeParse({ ...VALID_INPUT, guest_count: 0 });
    expect(r.success).toBe(false);
  });

  it('rejects guest_count > 2000', () => {
    const r = customRequestSchema.safeParse({ ...VALID_INPUT, guest_count: 2001 });
    expect(r.success).toBe(false);
  });

  it('rejects non-integer guest_count', () => {
    const r = customRequestSchema.safeParse({ ...VALID_INPUT, guest_count: 1.5 });
    expect(r.success).toBe(false);
  });

  it('rejects event_type not in allowlist', () => {
    const r = customRequestSchema.safeParse({ ...VALID_INPUT, event_type: 'totally-made-up' });
    expect(r.success).toBe(false);
  });

  it('rejects description shorter than 50 chars', () => {
    const r = customRequestSchema.safeParse({ ...VALID_INPUT, description: 'too short' });
    expect(r.success).toBe(false);
  });

  it('rejects description longer than 1000 chars', () => {
    const r = customRequestSchema.safeParse({ ...VALID_INPUT, description: 'a'.repeat(1001) });
    expect(r.success).toBe(false);
  });

  it('exports EVENT_TYPES as a 7-entry tuple', () => {
    expect(EVENT_TYPES).toHaveLength(7);
    expect(EVENT_TYPES).toContain('mehndi');
    expect(EVENT_TYPES).toContain('other');
  });
});
