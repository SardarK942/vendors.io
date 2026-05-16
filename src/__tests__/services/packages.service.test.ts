import { describe, it, expect } from 'vitest';
import {
  createPackage,
  deactivatePackage,
  setPackageActiveState,
  hardDeletePackage,
  listPackagesForVendor,
} from '@/services/packages.service';

// ─── createPackage ─────────────────────────────────────────────────────────────

describe('packages.service', () => {
  describe('createPackage', () => {
    it('returns created package with addons', async () => {
      const sb = buildCreatePackageSupabase({ pkgError: null, addonsError: null });
      const result = await createPackage(sb as never, 'vp-1', minimalPackageInput());
      expect(result.error).toBeNull();
      expect(result.data?.package).toBeTruthy();
    });

    it('returns INSERT_FAILED error when package insert fails', async () => {
      const sb = buildCreatePackageSupabase({ pkgError: { message: 'db error' }, addonsError: null });
      const result = await createPackage(sb as never, 'vp-1', minimalPackageInput());
      expect(result.error?.code).toBe('INSERT_FAILED');
    });
  });

  // ─── deactivatePackage ───────────────────────────────────────────────────────

  describe('deactivatePackage', () => {
    it('blocks deactivation when it would leave 0 active packages', async () => {
      const sb = buildDeactivateSupabase({ otherActiveCount: 0 });
      const result = await deactivatePackage(sb as never, 'pkg-1', 'vp-1');
      expect(result.error?.code).toBe('LAST_ACTIVE_PACKAGE');
      expect(result.data).toBeNull();
    });

    it('allows deactivation when >= 1 other active package remains', async () => {
      const sb = buildDeactivateSupabase({ otherActiveCount: 1 });
      const result = await deactivatePackage(sb as never, 'pkg-1', 'vp-1');
      expect(result.error).toBeNull();
      expect(result.data).toBeTruthy();
    });
  });

  // ─── setPackageActiveState ───────────────────────────────────────────────────

  describe('setPackageActiveState', () => {
    it('calls deactivatePackage when is_active=false', async () => {
      const sb = buildDeactivateSupabase({ otherActiveCount: 0 });
      const result = await setPackageActiveState(sb as never, 'pkg-1', 'vp-1', false);
      // Should hit LAST_ACTIVE_PACKAGE guard
      expect(result.error?.code).toBe('LAST_ACTIVE_PACKAGE');
    });

    it('activates package when is_active=true', async () => {
      const sb = buildActivateSupabase();
      const result = await setPackageActiveState(sb as never, 'pkg-1', 'vp-1', true);
      expect(result.error).toBeNull();
      expect(result.data).toBeTruthy();
    });
  });

  // ─── hardDeletePackage ───────────────────────────────────────────────────────

  describe('hardDeletePackage', () => {
    it('blocks hard delete when it would leave 0 active packages', async () => {
      const sb = buildHardDeleteSupabase({ otherActiveCount: 0, activeBookings: [] });
      const result = await hardDeletePackage(sb as never, 'pkg-1', 'vp-1');
      expect(result.error?.code).toBe('LAST_ACTIVE_PACKAGE');
    });

    it('blocks hard delete when active bookings reference the package', async () => {
      const sb = buildHardDeleteSupabase({
        otherActiveCount: 2,
        activeBookings: [{ id: 'booking-1' }],
      });
      const result = await hardDeletePackage(sb as never, 'pkg-1', 'vp-1');
      expect(result.error?.code).toBe('ACTIVE_BOOKINGS_EXIST');
    });

    it('allows hard delete when no active bookings and other active packages exist', async () => {
      const sb = buildHardDeleteSupabase({ otherActiveCount: 2, activeBookings: [] });
      const result = await hardDeletePackage(sb as never, 'pkg-1', 'vp-1');
      expect(result.error).toBeNull();
      expect(result.data?.deleted).toBe(true);
    });
  });

  // ─── listPackagesForVendor ───────────────────────────────────────────────────

  describe('listPackagesForVendor', () => {
    it('returns packages list on success', async () => {
      const sb = buildListSupabase({ packages: [{ id: 'pkg-1', is_active: true }] });
      const result = await listPackagesForVendor(sb as never, 'vp-1');
      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1);
    });

    it('returns empty array when no packages', async () => {
      const sb = buildListSupabase({ packages: [] });
      const result = await listPackagesForVendor(sb as never, 'vp-1');
      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(0);
    });
  });
});

// ─── Minimal input helper ─────────────────────────────────────────────────────

function minimalPackageInput() {
  return {
    name: 'Engagement Session',
    description: 'Two-hour shoot',
    base_price_cents: 80000,
    included_items: ['2 hours coverage'],
    max_guests: 50,
    duration_hours: 2,
    events_count: 1,
    featured_image_url: 'https://example.com/photo.jpg',
    gallery_image_urls: [],
    location_mode: 'couple_provides' as const,
    addons: [{ name: 'Drone footage', price_delta_cents: 30000 }],
  };
}

// ─── Supabase mock builders ───────────────────────────────────────────────────

function buildCreatePackageSupabase({
  pkgError,
  addonsError,
}: {
  pkgError: { message: string } | null;
  addonsError: { message: string } | null;
}) {
  const pkg = { id: 'pkg-1', vendor_profile_id: 'vp-1', name: 'Engagement Session' };
  return {
    from: (table: string) => {
      if (table === 'packages') {
        return {
          select: (_cols: unknown, opts?: { count: string; head: boolean }) => {
            if (opts?.count === 'exact' && opts?.head === true) {
              return { eq: () => Promise.resolve({ count: 0, error: null }) };
            }
            return { eq: () => ({ single: () => Promise.resolve({ data: pkg, error: null }) }) };
          },
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: pkgError ? null : pkg, error: pkgError }),
            }),
          }),
          delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      if (table === 'package_addons') {
        return {
          insert: () => ({
            select: () =>
              Promise.resolve({
                data: addonsError ? null : [{ id: 'addon-1', name: 'Drone footage', price_delta_cents: 30000 }],
                error: addonsError,
              }),
          }),
        };
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) };
    },
  };
}

function buildDeactivateSupabase({ otherActiveCount }: { otherActiveCount: number }) {
  const pkg = { id: 'pkg-1', vendor_profile_id: 'vp-1', is_active: false };
  return {
    from: (table: string) => {
      if (table === 'packages') {
        return {
          select: (_cols: unknown) => ({
            eq: () => ({
              eq: () => ({
                neq: () => Promise.resolve({ count: otherActiveCount, error: null }),
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: () => Promise.resolve({ data: pkg, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) };
    },
  };
}

function buildActivateSupabase() {
  const pkg = { id: 'pkg-1', vendor_profile_id: 'vp-1', is_active: true };
  return {
    from: (table: string) => {
      if (table === 'packages') {
        return {
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: () => Promise.resolve({ data: pkg, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) };
    },
  };
}

function buildHardDeleteSupabase({
  otherActiveCount,
  activeBookings,
}: {
  otherActiveCount: number;
  activeBookings: { id: string }[];
}) {
  return {
    from: (table: string) => {
      if (table === 'packages') {
        return {
          select: (_cols: unknown) => ({
            eq: () => ({
              eq: () => ({
                neq: () => Promise.resolve({ count: otherActiveCount, error: null }),
              }),
            }),
          }),
          delete: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ error: null }),
            }),
          }),
        };
      }
      if (table === 'bookings') {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                limit: () => Promise.resolve({ data: activeBookings, error: null }),
              }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) };
    },
  };
}

function buildListSupabase({ packages }: { packages: unknown[] }) {
  // Build a chainable object that always resolves with packages at the end
  function chainable(): Record<string, unknown> {
    const obj: Record<string, (...args: unknown[]) => unknown> = {};
    const terminal = () => Promise.resolve({ data: packages, error: null });
    ['eq', 'neq', 'in', 'limit', 'select'].forEach((m) => {
      obj[m] = () => chainable();
    });
    obj['order'] = terminal;
    return obj;
  }

  return {
    from: (table: string) => {
      if (table === 'packages') {
        return {
          select: () => chainable(),
        };
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) };
    },
  };
}
