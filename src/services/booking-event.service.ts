import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

export interface UpdateNotesResult {
  data: { ok: true } | null;
  error: { code: 'too_long' | 'not_found' | 'forbidden' | 'db_error'; message?: string } | null;
}

const MAX_NOTES = 5000;

/**
 * Save private vendor notes on a booking_event. Authorization is verified by
 * joining through bookings → vendor_profiles → users.user_id = caller's id. RLS
 * also enforces this at the DB layer (migration 00034 update policy), but the
 * explicit check returns clean error codes instead of swallowed empty updates.
 */
export async function updateVendorNotes(
  supabase: SupabaseClient<Database>,
  bookingEventId: string,
  userId: string,
  notes: string
): Promise<UpdateNotesResult> {
  const trimmed = notes.trim();
  if (trimmed.length > MAX_NOTES) {
    return {
      data: null,
      error: { code: 'too_long', message: `Notes must be ≤ ${MAX_NOTES} chars.` },
    };
  }

  const { data: existing, error: findError } = await supabase
    .from('booking_events')
    .select(
      'id, booking_id, bookings!inner(vendor_profile_id, vendor_profiles!inner(user_id))'
    )
    .eq('id', bookingEventId)
    .maybeSingle();

  if (findError) {
    return { data: null, error: { code: 'db_error', message: findError.message } };
  }
  if (!existing) {
    return { data: null, error: { code: 'not_found' } };
  }

  const ownerUserId = (
    existing as unknown as {
      bookings: { vendor_profiles: { user_id: string } };
    }
  ).bookings.vendor_profiles.user_id;
  if (ownerUserId !== userId) {
    return { data: null, error: { code: 'forbidden' } };
  }

  const { error: updateError } = await supabase
    .from('booking_events')
    .update({ vendor_notes: trimmed })
    .eq('id', bookingEventId);

  if (updateError) {
    return { data: null, error: { code: 'db_error', message: updateError.message } };
  }
  return { data: { ok: true }, error: null };
}
