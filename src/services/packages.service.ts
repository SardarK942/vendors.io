import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { CreatePackageInput, UpdatePackageInput } from '@/types';
import { deleteUtByUrls } from '@/lib/uploadthing';

const ACTIVE_BOOKING_STATUSES = [
  'pending',
  'accepted',
  'adjusted_quote_sent',
  'adjusted_quote_declined',
  'deposit_paid',
] as const;

interface ServiceError {
  code: string;
  message: string;
  active_count?: number;
}

interface ServiceResult<T> {
  data: T | null;
  error: ServiceError | null;
}

/**
 * Enforce a single "most popular" package per vendor: unset is_featured on
 * every other package this vendor owns. Called after a package is saved with
 * is_featured=true. Best-effort — a failure here doesn't fail the save, and
 * getFeaturedPackage() tolerates multiple flags by picking the cheapest.
 */
async function clearOtherFeatured(
  supabase: SupabaseClient<Database>,
  vendorProfileId: string,
  keepPackageId: string
): Promise<void> {
  await supabase
    .from('packages')
    .update({ is_featured: false })
    .eq('vendor_profile_id', vendorProfileId)
    .eq('is_featured', true)
    .neq('id', keepPackageId);
}

// ─── Create ────────────────────────────────────────────────────────────────────

export async function createPackage(
  supabase: SupabaseClient<Database>,
  vendorProfileId: string,
  input: CreatePackageInput
): Promise<ServiceResult<{ package: Record<string, unknown>; addons: Record<string, unknown>[] }>> {
  const { addons, ...packageData } = input;

  // Compute display_order (append at end)
  const { count } = await supabase
    .from('packages')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_profile_id', vendorProfileId);

  const { data: pkg, error: pkgError } = await supabase
    .from('packages')
    .insert({ ...packageData, vendor_profile_id: vendorProfileId, display_order: count ?? 0 })
    .select('*')
    .single();

  if (pkgError) return { data: null, error: { code: 'INSERT_FAILED', message: pkgError.message } };

  let createdAddons: Record<string, unknown>[] = [];
  if (addons && addons.length > 0) {
    const addonRows = addons.map((a, i) => ({ ...a, package_id: pkg.id, display_order: i }));
    const { data, error: addonsError } = await supabase
      .from('package_addons')
      .insert(addonRows)
      .select('*');
    if (addonsError) {
      // Rollback package creation
      await supabase.from('packages').delete().eq('id', pkg.id);
      return { data: null, error: { code: 'ADDONS_FAILED', message: addonsError.message } };
    }
    createdAddons = (data ?? []) as Record<string, unknown>[];
  }

  if (packageData.is_featured) {
    await clearOtherFeatured(supabase, vendorProfileId, pkg.id as string);
  }

  return { data: { package: pkg as Record<string, unknown>, addons: createdAddons }, error: null };
}

// ─── Update ────────────────────────────────────────────────────────────────────

export async function updatePackage(
  supabase: SupabaseClient<Database>,
  packageId: string,
  vendorProfileId: string,
  input: UpdatePackageInput
): Promise<ServiceResult<{ package: Record<string, unknown>; addons: Record<string, unknown>[] }>> {
  const { addons, ...packageData } = input;

  // Verify ownership
  const { data: existing } = await supabase
    .from('packages')
    .select('id, vendor_profile_id')
    .eq('id', packageId)
    .single();

  if (!existing || existing.vendor_profile_id !== vendorProfileId) {
    return {
      data: null,
      error: { code: 'NOT_FOUND_OR_FORBIDDEN', message: 'Package not found or not yours' },
    };
  }

  const { data: pkg, error } = await supabase
    .from('packages')
    .update({ ...packageData, updated_at: new Date().toISOString() })
    .eq('id', packageId)
    .select('*')
    .single();

  if (error) return { data: null, error: { code: 'UPDATE_FAILED', message: error.message } };

  if (packageData.is_featured) {
    await clearOtherFeatured(supabase, vendorProfileId, packageId);
  }

  // Addons replace pattern: delete all, re-insert provided
  if (addons !== undefined) {
    await supabase.from('package_addons').delete().eq('package_id', packageId);
    if (addons.length > 0) {
      const addonRows = addons.map((a, i) => ({ ...a, package_id: packageId, display_order: i }));
      await supabase.from('package_addons').insert(addonRows);
    }
  }

  const { data: currentAddons } = await supabase
    .from('package_addons')
    .select('*')
    .eq('package_id', packageId)
    .order('display_order');

  return {
    data: {
      package: pkg as Record<string, unknown>,
      addons: (currentAddons ?? []) as Record<string, unknown>[],
    },
    error: null,
  };
}

// ─── Deactivate (soft delete) ──────────────────────────────────────────────────

export async function deactivatePackage(
  supabase: SupabaseClient<Database>,
  packageId: string,
  vendorProfileId: string
): Promise<ServiceResult<Record<string, unknown>>> {
  // Count other active packages for this vendor
  const { count } = await supabase
    .from('packages')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_profile_id', vendorProfileId)
    .eq('is_active', true)
    .neq('id', packageId);

  if ((count ?? 0) === 0) {
    return {
      data: null,
      error: {
        code: 'LAST_ACTIVE_PACKAGE',
        message:
          'This is your only active package. You need at least one active package to remain searchable. Add another package first, or pause your profile in settings.',
      },
    };
  }

  const { data, error } = await supabase
    .from('packages')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', packageId)
    .eq('vendor_profile_id', vendorProfileId)
    .select('*')
    .single();

  if (error) return { data: null, error: { code: 'UPDATE_FAILED', message: error.message } };
  return { data: data as Record<string, unknown>, error: null };
}

// ─── Toggle active state ───────────────────────────────────────────────────────

export async function setPackageActiveState(
  supabase: SupabaseClient<Database>,
  packageId: string,
  vendorProfileId: string,
  isActive: boolean
): Promise<ServiceResult<Record<string, unknown>>> {
  if (!isActive) return deactivatePackage(supabase, packageId, vendorProfileId);

  const { data, error } = await supabase
    .from('packages')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('id', packageId)
    .eq('vendor_profile_id', vendorProfileId)
    .select('*')
    .single();

  if (error) return { data: null, error: { code: 'UPDATE_FAILED', message: error.message } };
  return { data: data as Record<string, unknown>, error: null };
}

// ─── Set "Most popular" flag ─────────────────────────────────────────────────────

/**
 * Toggle the vendor-chosen "Most popular" package (#3). Setting one clears the
 * flag on the vendor's other packages so at most one is ever featured. Verifies
 * ownership before writing.
 */
export async function setPackageFeatured(
  supabase: SupabaseClient<Database>,
  packageId: string,
  vendorProfileId: string,
  isFeatured: boolean
): Promise<ServiceResult<Record<string, unknown>>> {
  const { data, error } = await supabase
    .from('packages')
    .update({ is_featured: isFeatured, updated_at: new Date().toISOString() })
    .eq('id', packageId)
    .eq('vendor_profile_id', vendorProfileId)
    .select('*')
    .single();

  if (error) return { data: null, error: { code: 'UPDATE_FAILED', message: error.message } };
  if (!data) {
    return {
      data: null,
      error: { code: 'NOT_FOUND_OR_FORBIDDEN', message: 'Package not found or not yours' },
    };
  }

  if (isFeatured) {
    await clearOtherFeatured(supabase, vendorProfileId, packageId);
  }

  return { data: data as Record<string, unknown>, error: null };
}

// ─── Hard delete ───────────────────────────────────────────────────────────────

export async function hardDeletePackage(
  supabase: SupabaseClient<Database>,
  packageId: string,
  vendorProfileId: string
): Promise<ServiceResult<{ deleted: true }>> {
  // Check 1: would this leave 0 active packages?
  const { count: activeOthers } = await supabase
    .from('packages')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_profile_id', vendorProfileId)
    .eq('is_active', true)
    .neq('id', packageId);

  if ((activeOthers ?? 0) === 0) {
    return {
      data: null,
      error: { code: 'LAST_ACTIVE_PACKAGE', message: 'You must keep at least one active package.' },
    };
  }

  // Check 2: any active bookings referencing this package?
  const { data: activeBookings } = await supabase
    .from('bookings')
    .select('id')
    .eq('package_id', packageId)
    .in('status', [...ACTIVE_BOOKING_STATUSES])
    .limit(1);

  if (activeBookings && activeBookings.length > 0) {
    return {
      data: null,
      error: {
        code: 'ACTIVE_BOOKINGS_EXIST',
        message:
          'This package has active bookings. Deactivate it instead so it stays linked to ongoing work.',
        active_count: activeBookings.length,
      },
    };
  }

  // Grab the package's UploadThing blobs before the row is gone so we can
  // reclaim them after a successful delete.
  const { data: media } = await supabase
    .from('packages')
    .select('featured_image_url, gallery_image_urls')
    .eq('id', packageId)
    .eq('vendor_profile_id', vendorProfileId)
    .maybeSingle();

  // Safe to hard delete; FK ON DELETE SET NULL clears bookings.package_id on historical rows.
  const { error } = await supabase
    .from('packages')
    .delete()
    .eq('id', packageId)
    .eq('vendor_profile_id', vendorProfileId);

  if (error) return { data: null, error: { code: 'DELETE_FAILED', message: error.message } };

  // Best-effort blob cleanup — the row is already gone, so a delete failure here
  // must never fail the operation (it just leaves an orphan for the sweep).
  if (media) {
    const urls: string[] = [];
    if (media.featured_image_url) urls.push(media.featured_image_url);
    const gallery = media.gallery_image_urls;
    if (Array.isArray(gallery)) {
      for (const g of gallery) if (typeof g === 'string') urls.push(g);
    }
    if (urls.length > 0) {
      try {
        await deleteUtByUrls(urls);
      } catch (e) {
        console.error('[packages] blob cleanup failed for deleted package', packageId, e);
      }
    }
  }

  return { data: { deleted: true }, error: null };
}

// ─── Reorder ─────────────────────────────────────────────────────────────────────

/**
 * Persist a new package ordering by writing display_order = position for each
 * id. The provided list must be exactly this vendor's package ids (all of them,
 * no strays) — a guard against a client sending a partial or foreign set. Counts
 * are tiny (a handful per vendor), so per-row updates in parallel are fine.
 */
export async function reorderPackages(
  supabase: SupabaseClient<Database>,
  vendorProfileId: string,
  orderedIds: string[]
): Promise<ServiceResult<{ reordered: true }>> {
  const { data: existing, error: listErr } = await supabase
    .from('packages')
    .select('id')
    .eq('vendor_profile_id', vendorProfileId);

  if (listErr) return { data: null, error: { code: 'LIST_FAILED', message: listErr.message } };

  const ownedIds = new Set((existing ?? []).map((p) => p.id));
  const allOwned = orderedIds.every((id) => ownedIds.has(id));
  if (orderedIds.length !== ownedIds.size || !allOwned) {
    return {
      data: null,
      error: { code: 'INVALID_ORDER', message: 'Order must list exactly your packages.' },
    };
  }

  const now = new Date().toISOString();
  const results = await Promise.all(
    orderedIds.map((id, i) =>
      supabase
        .from('packages')
        .update({ display_order: i, updated_at: now })
        .eq('id', id)
        .eq('vendor_profile_id', vendorProfileId)
    )
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return { data: null, error: { code: 'UPDATE_FAILED', message: failed.error.message } };
  }

  return { data: { reordered: true }, error: null };
}

// ─── List ──────────────────────────────────────────────────────────────────────

export async function listPackagesForVendor(
  supabase: SupabaseClient<Database>,
  vendorProfileId: string,
  includeInactive = false
): Promise<ServiceResult<Record<string, unknown>[]>> {
  let query = supabase
    .from('packages')
    .select('*, addons:package_addons(*)')
    .eq('vendor_profile_id', vendorProfileId);

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query.order('display_order');
  if (error) return { data: null, error: { code: 'LIST_FAILED', message: error.message } };
  return { data: (data ?? []) as Record<string, unknown>[], error: null };
}
