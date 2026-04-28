import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { HttpError } from '@/lib/api/error-boundary';

export type BookingRow = Database['public']['Tables']['booking_requests']['Row'];
export type VendorProfileRow = Database['public']['Tables']['vendor_profiles']['Row'];

export async function requireUser(): Promise<{
  user: User;
  supabase: SupabaseClient<Database>;
}> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new HttpError(401, 'Unauthorized');
  }

  return { user, supabase };
}

/**
 * Looks up a booking and verifies the user is either its couple or its vendor.
 * Throws 404 if not found, 403 if the user has no claim. Returns the role so
 * callers don't have to recompute it.
 */
export async function requireBookingAccess(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  userId: string
): Promise<{ booking: BookingRow; role: 'couple' | 'vendor' }> {
  const { data: booking } = await supabase
    .from('booking_requests')
    .select('*, vendor_profiles!inner(user_id)')
    .eq('id', bookingId)
    .single();

  if (!booking) throw new HttpError(404, 'Booking not found');

  const vp = booking.vendor_profiles as unknown as { user_id: string };

  if (booking.couple_user_id === userId) {
    return { booking: booking as unknown as BookingRow, role: 'couple' };
  }
  if (vp.user_id === userId) {
    return { booking: booking as unknown as BookingRow, role: 'vendor' };
  }

  throw new HttpError(404, 'Booking not found');
}

/**
 * Looks up the vendor profile for the given user. Throws 404 if the user isn't a vendor.
 * Handy for vendor-only endpoints (/vendors/me/*).
 */
export async function requireVendorProfile(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<VendorProfileRow> {
  const { data: vp } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!vp) throw new HttpError(404, 'Vendor profile not found');
  return vp as VendorProfileRow;
}
