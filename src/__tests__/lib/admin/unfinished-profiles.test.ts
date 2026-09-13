import { describe, it, expect } from 'vitest';
import type { Database } from '@/types/database.types';
import { buildUnfinishedRow, emailList } from '@/lib/admin/unfinished-profiles';

type VendorRow = Database['public']['Tables']['vendor_profiles']['Row'];

const NOW = Date.UTC(2026, 8, 12); // 2026-09-12

/**
 * A fully publish-ready profile; override fields to create blockers. Overrides
 * are loosely typed so tests can simulate real DB nulls (e.g. updated_at) that
 * the generated Row type declares non-nullable.
 */
function profile(overrides: Record<string, unknown> = {}): VendorRow {
  return {
    id: 'p1',
    business_name: 'Only Fryzz',
    category: 'carts',
    bio: 'Gourmet fries in a cone.',
    instagram_handle: 'onlyfryzz',
    portfolio_images: ['https://img/1.jpg'],
    languages: ['English'],
    years_in_business: 3,
    response_sla_hours: 24,
    created_at: '2026-09-02T00:00:00.000Z',
    updated_at: '2026-09-05T00:00:00.000Z',
    ...overrides,
  } as unknown as VendorRow;
}

describe('buildUnfinishedRow', () => {
  it('lists the missing publish-gate fields for an incomplete profile', () => {
    const row = buildUnfinishedRow(
      profile({ bio: null, portfolio_images: [], languages: [] }),
      'vendor@example.com',
      NOW
    );
    expect(row.missingFields).toContain('bio');
    expect(row.missingFields).toContain('portfolio_images');
    expect(row.missingFields).toContain('languages');
    expect(row.missingCount).toBe(3);
  });

  it('reports completeness as the percentage of satisfied gate fields', () => {
    // 8 gate fields, 2 missing → 6/8 = 75%.
    const row = buildUnfinishedRow(
      profile({ bio: null, languages: [] }),
      'vendor@example.com',
      NOW
    );
    expect(row.completeness).toBe(75);
  });

  it('reports 100% completeness and no missing fields when nothing blocks publish', () => {
    const row = buildUnfinishedRow(profile(), 'vendor@example.com', NOW);
    expect(row.missingCount).toBe(0);
    expect(row.completeness).toBe(100);
  });

  it('computes days stalled from the last update', () => {
    // updated_at 2026-09-05, now 2026-09-12 → 7 days.
    const row = buildUnfinishedRow(profile(), 'vendor@example.com', NOW);
    expect(row.daysStalled).toBe(7);
  });

  it('falls back to created_at for days stalled when never updated', () => {
    const row = buildUnfinishedRow(profile({ updated_at: null }), 'vendor@example.com', NOW);
    expect(row.daysStalled).toBe(10); // created 2026-09-02
  });
});

describe('emailList', () => {
  it('dedupes and comma-joins emails', () => {
    expect(emailList([{ email: 'a@x.com' }, { email: 'b@x.com' }, { email: 'a@x.com' }])).toBe(
      'a@x.com, b@x.com'
    );
  });
});
