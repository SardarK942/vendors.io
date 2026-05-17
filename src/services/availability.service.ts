// src/services/availability.service.ts
// Sub-project G — calendar / double-booking prevention helpers.
// These are app-level pre-checks; the DB trigger is the authoritative safety net.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

type Sb = SupabaseClient<Database>;

interface BuildRangeOpts {
  fullDay?: boolean;
}

/**
 * Build a Postgres tstzrange literal for a date + start/end time (UTC).
 *
 * Format: ["2026-08-15T10:00:00+00:00","2026-08-15T12:00:00+00:00")
 *
 * The half-open `[)` bound is the Postgres convention for time ranges
 * (start inclusive, end exclusive). The `+00:00` suffix (not `Z`) is
 * required for Postgres tstzrange literal parsing.
 *
 * @param date      'YYYY-MM-DD'
 * @param startTime 'HH:mm'
 * @param endTime   'HH:mm' (ignored when opts.fullDay = true)
 * @param opts      { fullDay?: boolean }
 */
export function buildHoldRange(
  date: string,
  startTime: string,
  endTime: string,
  opts: BuildRangeOpts = {}
): string {
  if (opts.fullDay) {
    const nextDay = new Date(`${date}T00:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const nextDayStr = nextDay.toISOString().slice(0, 10);
    return `["${date}T00:00:00+00:00","${nextDayStr}T00:00:00+00:00")`;
  }
  return `["${date}T${startTime}:00+00:00","${date}T${endTime}:00+00:00")`;
}

/**
 * Count holds that overlap a given time range for a vendor.
 *
 * Uses PostgREST's `ov` filter operator which maps to Postgres `&&` on ranges.
 * Note: if this operator is unavailable in an older Supabase PostgREST version,
 * fall back to fetching all holds for the date and filtering in JS — acceptable
 * since vendors won't have thousands of holds per day.
 */
export async function checkOverlap(
  supabase: Sb,
  vendorProfileId: string,
  date: string,
  startTime: string,
  endTime: string
): Promise<{ overlapping: number }> {
  const range = buildHoldRange(date, startTime, endTime);
  const { data, error } = await supabase
    .from('vendor_calendar_holds')
    .select('id')
    .eq('vendor_profile_id', vendorProfileId)
    .filter('hold_range', 'ov', range);

  if (error) throw error;
  return { overlapping: (data ?? []).length };
}

/**
 * Check whether inserting a new hold for this range would exceed the vendor's
 * concurrent_capacity. Returns the count + capacity for friendly UX errors.
 *
 * Runs vendor lookup + overlap count in parallel via Promise.all.
 */
export async function wouldExceedCapacity(
  supabase: Sb,
  vendorProfileId: string,
  date: string,
  startTime: string,
  endTime: string
): Promise<{ wouldExceed: boolean; capacity: number; overlapping: number }> {
  const [profileResult, overlapResult] = await Promise.all([
    supabase
      .from('vendor_profiles')
      .select('concurrent_capacity')
      .eq('id', vendorProfileId)
      .single(),
    checkOverlap(supabase, vendorProfileId, date, startTime, endTime),
  ]);

  if (profileResult.error) throw profileResult.error;
  const capacity = (profileResult.data as { concurrent_capacity: number }).concurrent_capacity;
  const { overlapping } = overlapResult;

  return { wouldExceed: overlapping >= capacity, capacity, overlapping };
}

/**
 * Get all holds for a vendor within a date window, used for the couple-side
 * availability calendar. Returns raw hold_range strings; the caller aggregates
 * them per date for display (privacy-preserving: no booking vs vendor-blocked
 * distinction is exposed at this layer).
 *
 * Queries by overlapping with a wide range spanning fromDate..toDate.
 */
export async function getUnavailableRanges(
  supabase: Sb,
  vendorProfileId: string,
  fromDate: string,
  toDate: string
): Promise<Array<{ hold_range: string }>> {
  // Build a range that spans the entire from..to window to use as the overlap filter.
  const windowRange = `["${fromDate}T00:00:00+00:00","${toDate}T23:59:59+00:00")`;

  const { data, error } = await supabase
    .from('vendor_calendar_holds')
    .select('hold_range')
    .eq('vendor_profile_id', vendorProfileId)
    .filter('hold_range', 'ov', windowRange);

  if (error) throw error;
  return (data ?? []) as Array<{ hold_range: string }>;
}
