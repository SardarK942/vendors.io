import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { CreatePackageInput, UpdatePackageInput } from '@/types';

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
    return { data: null, error: { code: 'NOT_FOUND_OR_FORBIDDEN', message: 'Package not found or not yours' } };
  }

  const { data: pkg, error } = await supabase
    .from('packages')
    .update({ ...packageData, updated_at: new Date().toISOString() })
    .eq('id', packageId)
    .select('*')
    .single();

  if (error) return { data: null, error: { code: 'UPDATE_FAILED', message: error.message } };

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

  return { data: { package: pkg as Record<string, unknown>, addons: (currentAddons ?? []) as Record<string, unknown>[] }, error: null };
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

  // Safe to hard delete; FK ON DELETE SET NULL clears bookings.package_id on historical rows.
  const { error } = await supabase
    .from('packages')
    .delete()
    .eq('id', packageId)
    .eq('vendor_profile_id', vendorProfileId);

  if (error) return { data: null, error: { code: 'DELETE_FAILED', message: error.message } };
  return { data: { deleted: true }, error: null };
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
