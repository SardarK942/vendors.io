import { describe, it, expect } from 'vitest';
import { customRequestSchemaV2 } from '@/lib/booking/custom-request-validation';

const validBase = {
  vendor_slug: 'karim-photography',
  events: [
    { date: '2099-03-14', startTime: '16:00', guestCount: 200, eventTypeId: 'wedding' as const },
  ],
  description:
    'Traditional South Asian wedding, ceremony at 5 PM, want drone shots of the venue if possible with the wedding party.',
};

describe('customRequestSchemaV2 — v2 extensions', () => {
  it('accepts the legacy shape (no new fields)', () => {
    const parsed = customRequestSchemaV2.safeParse(validBase);
    expect(parsed.success).toBe(true);
  });

  it('accepts all four new optional fields', () => {
    const parsed = customRequestSchemaV2.safeParse({
      ...validBase,
      is_multi_day: true,
      event_city: 'Houston, TX',
      venue_name: 'The Post Oak Hotel',
      budget_range: '15k_30k',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown budget_range', () => {
    const parsed = customRequestSchemaV2.safeParse({ ...validBase, budget_range: 'huge_amount' });
    expect(parsed.success).toBe(false);
  });

  it('accepts null / undefined for the three optional string fields', () => {
    const parsed = customRequestSchemaV2.safeParse({
      ...validBase,
      event_city: null,
      venue_name: null,
      budget_range: null,
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts the three new Arab event type ids', () => {
    for (const eventTypeId of ['katb_el_kitab', 'laylat_al_henna', 'zaffa'] as const) {
      const parsed = customRequestSchemaV2.safeParse({
        ...validBase,
        events: [{ date: '2099-03-14', startTime: '16:00', guestCount: 200, eventTypeId }],
      });
      expect(parsed.success).toBe(true);
    }
  });
});
