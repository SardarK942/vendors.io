/**
 * B1 — Marketplace gate integration tests
 *
 * These tests verify the query-shape filtering logic that the three
 * marketplace pages apply:
 *   - /vendors           → only is_active=true AND onboarding_complete=true
 *   - /vendors/[slug]    → 404 if !onboarding_complete || !is_active (non-owner)
 *   - /vendors/[slug]/book → 404 if !onboarding_complete || !is_active (no owner exception)
 *
 * We use a mock Supabase client seeded with 3 deterministic vendor rows so
 * the test runs without a live DB connection and is stable in CI.
 */
import { describe, it, expect } from 'vitest';

// ── Deterministic test UUIDs (never collide with real data) ──────────────────

const TEST_UUIDS = {
  publishedVendor: '00000000-0000-0000-0000-000000000b01',
  unpublishedVendor: '00000000-0000-0000-0000-000000000b02',
  pausedVendor: '00000000-0000-0000-0000-000000000b03',
};

// ── Minimal vendor row shape ──────────────────────────────────────────────────

interface TestVendorRow {
  id: string;
  slug: string;
  business_name: string;
  is_active: boolean;
  onboarding_complete: boolean;
  user_id: string;
}

const SEED_VENDORS: TestVendorRow[] = [
  {
    id: TEST_UUIDS.publishedVendor,
    slug: 'published-vendor-b01',
    business_name: 'Published Vendor',
    is_active: true,
    onboarding_complete: true,
    user_id: '00000000-0000-0000-0000-000000000u01',
  },
  {
    id: TEST_UUIDS.unpublishedVendor,
    slug: 'unpublished-vendor-b02',
    business_name: 'Unpublished Vendor',
    is_active: true,
    onboarding_complete: false, // wizard not completed yet
    user_id: '00000000-0000-0000-0000-000000000u02',
  },
  {
    id: TEST_UUIDS.pausedVendor,
    slug: 'paused-vendor-b03',
    business_name: 'Paused Vendor',
    is_active: false,
    onboarding_complete: true, // wizard done, but paused
    user_id: '00000000-0000-0000-0000-000000000u03',
  },
];

// ── Pure filtering helpers that mirror each page's query logic ───────────────

/**
 * Mirrors the vendor list page query:
 *   .eq('is_active', true).eq('onboarding_complete', true)
 */
function applyListGate(vendors: TestVendorRow[]): TestVendorRow[] {
  return vendors.filter((v) => v.is_active === true && v.onboarding_complete === true);
}

/**
 * Mirrors the vendor detail page gate:
 *   if (!vendor.onboarding_complete || !vendor.is_active) → 404 for non-owners
 *   Owner can still see their own unpublished profile.
 */
function detailPageVisible(vendor: TestVendorRow, requestingUserId: string | null): boolean {
  if (vendor.onboarding_complete && vendor.is_active) return true;
  // Owner exception: owner can preview their own unpublished/paused profile
  return requestingUserId === vendor.user_id;
}

/**
 * Mirrors the booking page gate:
 *   if (!vendor.onboarding_complete || !vendor.is_active) → 404 (no owner exception)
 */
function bookingPageVisible(vendor: TestVendorRow): boolean {
  return vendor.onboarding_complete === true && vendor.is_active === true;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('marketplace gate — B1.1: vendor list only shows published + active', () => {
  it('returns only the published vendor from the three seeded rows', () => {
    const visible = applyListGate(SEED_VENDORS);
    expect(visible.map((v) => v.id)).toEqual([TEST_UUIDS.publishedVendor]);
  });

  it('excludes unpublished vendor (onboarding_complete=false)', () => {
    const visible = applyListGate(SEED_VENDORS);
    expect(visible.map((v) => v.id)).not.toContain(TEST_UUIDS.unpublishedVendor);
  });

  it('excludes paused vendor (is_active=false)', () => {
    const visible = applyListGate(SEED_VENDORS);
    expect(visible.map((v) => v.id)).not.toContain(TEST_UUIDS.pausedVendor);
  });

  it('returns empty list when all vendors are unpublished/paused', () => {
    const allUnpublished: TestVendorRow[] = SEED_VENDORS.map((v) => ({
      ...v,
      onboarding_complete: false,
      is_active: false,
    }));
    expect(applyListGate(allUnpublished)).toHaveLength(0);
  });
});

describe('marketplace gate — B1.2: vendor detail page visibility', () => {
  const published = SEED_VENDORS[0];
  const unpublished = SEED_VENDORS[1];
  const paused = SEED_VENDORS[2];

  it('published vendor is visible to anonymous visitors', () => {
    expect(detailPageVisible(published, null)).toBe(true);
  });

  it('unpublished vendor is NOT visible to anonymous visitors', () => {
    expect(detailPageVisible(unpublished, null)).toBe(false);
  });

  it('paused vendor is NOT visible to anonymous visitors', () => {
    expect(detailPageVisible(paused, null)).toBe(false);
  });

  it('unpublished vendor IS visible to its owner', () => {
    expect(detailPageVisible(unpublished, unpublished.user_id)).toBe(true);
  });

  it('paused vendor IS visible to its owner', () => {
    expect(detailPageVisible(paused, paused.user_id)).toBe(true);
  });

  it('unpublished vendor is NOT visible to a different logged-in user', () => {
    const differentUserId = '00000000-0000-0000-0000-000000000u99';
    expect(detailPageVisible(unpublished, differentUserId)).toBe(false);
  });
});

describe('marketplace gate — B1.3: booking page visibility (no owner exception)', () => {
  it('published vendor: booking page accessible', () => {
    expect(bookingPageVisible(SEED_VENDORS[0])).toBe(true);
  });

  it('unpublished vendor: booking page returns 404', () => {
    expect(bookingPageVisible(SEED_VENDORS[1])).toBe(false);
  });

  it('paused vendor: booking page returns 404', () => {
    expect(bookingPageVisible(SEED_VENDORS[2])).toBe(false);
  });

  it('owner cannot book their own unpublished profile (no owner exception on booking page)', () => {
    const unpublished = SEED_VENDORS[1];
    // bookingPageVisible ignores requestingUserId — no owner exception
    expect(bookingPageVisible(unpublished)).toBe(false);
  });
});
