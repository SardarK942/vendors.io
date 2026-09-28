import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/types/database.types';
import type {
  MeasurementProfileInput,
  UpdateMeasurementProfileInput,
  ServiceResult,
} from '@/types';

// Made-to-measure · reusable per-buyer body-measurement profiles.
//
// CRUD over user_measurement_profiles (see migration 00083 +
// docs/superpowers/specs/2026-09-27-measurement-profiles.md). Mirrors
// products.service / vendor.service: all DB access flows through the passed
// RLS-enforced client (never service-role). RLS already scopes rows to
// user_id = auth.uid(); the explicit user_id filters here are defence-in-depth
// so a wrong-owner id returns a clean 403/404 instead of leaking.

type MeasurementProfileRow = Database['public']['Tables']['user_measurement_profiles']['Row'];

// ─── Read: all profiles for the current buyer ────────────────────────────────

export async function getMeasurementProfiles(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<ServiceResult<MeasurementProfileRow[]>> {
  const { data, error } = await supabase
    .from('user_measurement_profiles')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return { error: error.message, status: 500 };
  return { data: (data ?? []) as MeasurementProfileRow[], status: 200 };
}

// ─── Read: single profile ─────────────────────────────────────────────────────

export async function getMeasurementProfile(
  supabase: SupabaseClient<Database>,
  id: string
): Promise<ServiceResult<MeasurementProfileRow>> {
  const { data, error } = await supabase
    .from('user_measurement_profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) return { error: error.message, status: 500 };
  if (!data) return { error: 'Measurement profile not found', status: 404 };
  return { data: data as MeasurementProfileRow, status: 200 };
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createMeasurementProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: MeasurementProfileInput
): Promise<ServiceResult<MeasurementProfileRow>> {
  const { data, error } = await supabase
    .from('user_measurement_profiles')
    .insert({
      user_id: userId,
      label: input.label,
      garment: input.garment,
      // measurements is a machine-key → inches bag; cast at the write boundary.
      measurements: input.measurements as Json,
      unit: input.unit,
    })
    .select('*')
    .single();

  if (error) return { error: error.message, status: 400 };
  return { data: data as MeasurementProfileRow, status: 201 };
}

// ─── Update (ownership-checked) ────────────────────────────────────────────────

export async function updateMeasurementProfile(
  supabase: SupabaseClient<Database>,
  id: string,
  userId: string,
  input: UpdateMeasurementProfileInput
): Promise<ServiceResult<MeasurementProfileRow>> {
  const { data: existing } = await supabase
    .from('user_measurement_profiles')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing || existing.user_id !== userId) {
    return { error: 'Measurement profile not found or not yours', status: 403 };
  }

  const { data, error } = await supabase
    .from('user_measurement_profiles')
    .update({
      ...(input.label !== undefined && { label: input.label }),
      ...(input.garment !== undefined && { garment: input.garment }),
      ...(input.measurements !== undefined && { measurements: input.measurements as Json }),
      ...(input.unit !== undefined && { unit: input.unit }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) return { error: error.message, status: 400 };
  return { data: data as MeasurementProfileRow, status: 200 };
}

// ─── Delete (ownership-checked) ────────────────────────────────────────────────

export async function deleteMeasurementProfile(
  supabase: SupabaseClient<Database>,
  id: string,
  userId: string
): Promise<ServiceResult<{ deleted: true }>> {
  const { data: existing } = await supabase
    .from('user_measurement_profiles')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing || existing.user_id !== userId) {
    return { error: 'Measurement profile not found or not yours', status: 403 };
  }

  const { error } = await supabase
    .from('user_measurement_profiles')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return { error: error.message, status: 400 };
  return { data: { deleted: true }, status: 200 };
}
