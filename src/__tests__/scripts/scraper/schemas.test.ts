import { describe, expect, it } from 'vitest';
import { scrapedRowSchema } from '../../../../scripts/scraper/lib/schemas';

describe('scrapedRowSchema', () => {
  it('accepts a minimal valid row', () => {
    const result = scrapedRowSchema.safeParse({
      source: 'hand_curated',
      business_name: 'Best Chai Cart',
      raw: { source: 'hand_curated' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a full row', () => {
    const result = scrapedRowSchema.safeParse({
      source: 'google_maps',
      source_external_id: 'ChIJ_abc123',
      business_name: 'Test Vendor',
      category: 'photography',
      tags: ['dhol'],
      city: 'Chicago',
      state: 'IL',
      postal_code: '60645',
      lat: 42.0,
      lng: -87.7,
      phone: '+13125551234',
      email: 'a@b.com',
      website: 'https://example.com',
      instagram_handle: 'bestchaicart',
      photos: ['https://cdn.example.com/x.jpg'],
      bio: 'Hello',
      raw: { source: 'google_maps' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects rows missing required fields', () => {
    expect(scrapedRowSchema.safeParse({}).success).toBe(false);
    expect(scrapedRowSchema.safeParse({ source: 'hand_curated' }).success).toBe(false);
  });

  it('rejects rows with invalid source', () => {
    const result = scrapedRowSchema.safeParse({
      source: 'made_up_source',
      business_name: 'X',
      raw: {},
    });
    expect(result.success).toBe(false);
  });
});
