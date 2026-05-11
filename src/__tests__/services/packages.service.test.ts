import { describe, it, expect } from 'vitest';
import {
  createPackage,
  updatePackage,
  deactivatePackage,
  setPackageActiveState,
  hardDeletePackage,
  listPackagesForVendor,
} from '@/services/packages.service';

// ─── Mock Supabase builder ─────────────────────────────────────────────────────
// We test logic/business rules through a minimal mock that captures calls.

function makeSupabaseMock(overrides: Record<string, unknown> = {}) {
  const insertedAddons: Record<string, unknown>[] = [];
  let packagesStore: Record<string, unknown>[] = [];

  const defaultPkg = {
    id: 'pkg-1',
    vendor_profile_id: 'vp-1',
    name: 'Test Package',
    description: 'Desc',
    base_price_cents: 100000,
    is_active: true,
    display_order: 0,
    ...overrides,
  };

  // fluent builder factory
  function makeBuilder(result: unknown) {
    const builder: Record<string, (...args: unknown[]) => unknown> = {};
    const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'in', 'limit', 'order', 'single', 'maybeSingle'];
    methods.forEach((m) => {
      builder[m] = (..._args: unknown[]) => builder;
    });
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
    // Spread so calling `.then` on the builder works like a promise
    return builder as unknown as Promise<unknown> & typeof builder;
  }

  const supabase = {
    from: (table: string) => {
      return {
        select: (cols?: string, opts?: Record<string, unknown>) => {
          if (table === 'packages' && opts?.count === 'exact' && opts?.head === true) {
            return {
              eq: () => ({ eq: () => ({ count: packagesStore.length, error: null }), count: packagesStore.length, error: null }),
              count: packagesStore.length,
              error: null,
            };
          }
          if (table === 'packages') {
            return {
              eq: (col: string, val: unknown) => ({
                single: () => Promise.resolve({ data: packagesStore.find((p) => (p as Record<string, unknown>)[col] === val) ?? null, error: null }),
                order: () => Promise.resolve({ data: packagesStore.filter((p) => (p as Record<string, unknown>)[col] === val), error: null }),
                eq: (col2: string, val2: unknown) => ({
                  count: packagesStore.filter((p) => (p as Record<string, unknown>)[col] === val && (p as Record<string, unknown>)[col2] === val2).length,
                  error: null,
                  neq: (col3: string, val3: unknown) => ({
                    count: packagesStore.filter(
                      (p) =>
                        (p as Record<string, unknown>)[col] === val &&
                        (p as Record<string, unknown>)[col2] === val2 &&
                        (p as Record<string, unknown>)[col3] !== val3
                    ).length,
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'bookings') {
            return {
              eq: () => ({
                in: (col: string, vals: unknown[]) => ({
                  limit: () => Promise.resolve({ data: [], error: null }),
                }),
              }),
            };
          }
          if (table === 'package_addons') {
            return {
              eq: () => ({
                order: () => Promise.resolve({ data: insertedAddons, error: null }),
              }),
            };
          }
          return { eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) };
        },
        insert: (rows: unknown) => {
          const arr = Array.isArray(rows) ? rows : [rows];
          if (table === 'packages') {
            const newPkg = { ...defaultPkg, ...arr[0] };
            packagesStore.push(newPkg);
            return {
              select: () => ({
                single: () => Promise.resolve({ data: newPkg, error: null }),
              }),
            };
          }
          if (table === 'package_addons') {
            insertedAddons.push(...arr);
            return {
              select: () => Promise.resolve({ data: arr, error: null }),
            };
          }
          return { select: () => ({ single: () => Promise.resolve({ data: arr[0], error: null }) }) };
        },
        update: (changes: unknown) => {
          const changesObj = changes as Record<string, unknown>;
          packagesStore = packagesStore.map((p) => {
            const pkg = p as Record<string, unknown>;
            return pkg.id === 'pkg-1' ? { ...pkg, ...changesObj } : pkg;
          });
          return {
            eq: (col: string, val: unknown) => ({
              eq: () => ({
                select: () => ({
                  single: () =>
                    Promise.resolve({
                      data: packagesStore.find((p) => (p as Record<string, unknown>)[col] === val) ?? null,
                      error: null,
                    }),
                }),
              }),
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: packagesStore.find((p) => (p as Record<string, unknown>)[col] === val) ?? null,
                    error: null,
                  }),
              }),
            }),
          };
        },
        delete: () => ({
          eq: (col: string, val: unknown) => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        }),
      };
    },
  };

  return { supabase: supabase as unknown, packagesStore, insertedAddons, defaultPkg };
}

// ─── createPackage ─────────────────────────────────────────────────────────────

describe('packages.service', () => {
  describe('createPackage', () => {
    it('returns created package with addons', async () => {
      const { supabase } = makeSupabaseMock();
      // Use a simpler test-double approach
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
          select: (_cols: unknown, opts?: { count: string; head: boolean }) => ({
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
          select: (_cols: unknown, opts?: { count: string; head: boolean }) => ({
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
