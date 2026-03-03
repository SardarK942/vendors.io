import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { BookingRequestInput, BookingStatus, QuoteInput, ServiceResult } from '@/types';

type BookingRow = Database['public']['Tables']['booking_requests']['Row'];

// ─── State Machine ──────────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['quoted', 'expired', 'declined'],
  quoted: ['deposit_paid', 'cancelled', 'expired'],
  deposit_paid: ['confirmed', 'declined'],
  confirmed: [],
  expired: [],
  declined: [],
  cancelled: [],
};

export function validateStateTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Service Functions ──────────────────────────────────────────

export async function createBookingRequest(
  supabase: SupabaseClient<Database>,
  coupleUserId: string,
  input: BookingRequestInput
): Promise<ServiceResult<{ id: string }>> {
  // Check for existing active request with same vendor
  const { data: existing } = await supabase
    .from('booking_requests')
    .select('id')
    .eq('couple_user_id', coupleUserId)
    .eq('vendor_profile_id', input.vendorProfileId)
    .in('status', ['pending', 'quoted'])
    .single();

  if (existing) {
    return { error: 'You already have an active request with this vendor', status: 409 };
  }

  const { data, error } = await supabase
    .from('booking_requests')
    .insert({
      couple_user_id: coupleUserId,
      vendor_profile_id: input.vendorProfileId,
      event_date: input.eventDate,
      event_type: input.eventType,
      guest_count: input.guestCount,
      budget_min: input.budgetMin,
      budget_max: input.budgetMax,
      special_requests: input.specialRequests,
      couple_phone: input.couplePhone,
      couple_email: input.coupleEmail,
    })
    .select('id')
    .single();

  if (error) {
    return { error: 'Failed to create booking request', status: 500 };
  }

  return { data: { id: data.id }, status: 201 };
}

export async function submitQuote(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  vendorUserId: string,
  input: QuoteInput
): Promise<ServiceResult<BookingRow>> {
  // Verify vendor owns this booking's vendor profile
  const { data: booking } = await supabase
    .from('booking_requests')
    .select('*, vendor_profiles!inner(user_id)')
    .eq('id', bookingId)
    .single();

  if (!booking) {
    return { error: 'Booking request not found', status: 404 };
  }

  const vendorProfile = booking.vendor_profiles as unknown as { user_id: string };
  if (vendorProfile.user_id !== vendorUserId) {
    return { error: 'Unauthorized', status: 403 };
  }

  if (!validateStateTransition(booking.status, 'quoted')) {
    return { error: `Cannot submit quote for booking in "${booking.status}" state`, status: 400 };
  }

  const { data, error } = await supabase
    .from('booking_requests')
    .update({
      status: 'quoted',
      vendor_quote_amount: input.quoteAmount,
      vendor_quote_notes: input.quoteNotes,
      vendor_responded_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
    .select()
    .single();

  if (error) {
    return { error: 'Failed to submit quote', status: 500 };
  }

  return { data, status: 200 };
}

export async function getBookingRequests(
  supabase: SupabaseClient<Database>,
  userId: string,
  role: 'couple' | 'vendor'
): Promise<ServiceResult<BookingRow[]>> {
  let query = supabase
    .from('booking_requests')
    .select('*, vendor_profiles(business_name, slug, category)');

  if (role === 'couple') {
    query = query.eq('couple_user_id', userId);
  } else {
    // Vendor: get bookings for their profiles
    const { data: vendorProfile } = await supabase
      .from('vendor_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!vendorProfile) {
      return { data: [], status: 200 };
    }

    query = query.eq('vendor_profile_id', vendorProfile.id);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    return { error: 'Failed to fetch bookings', status: 500 };
  }

  return { data: data ?? [], status: 200 };
}

export async function getBookingById(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  _userId: string
): Promise<ServiceResult<BookingRow>> {
  const { data, error } = await supabase
    .from('booking_requests')
    .select('*, vendor_profiles(business_name, slug, category, user_id)')
    .eq('id', bookingId)
    .single();

  if (error || !data) {
    return { error: 'Booking not found', status: 404 };
  }

  // CRITICAL: Redact contact info if deposit not paid (anti-backdooring)
  if (!data.couple_contact_revealed) {
    data.couple_phone = null;
    data.couple_email = null;
  }

  return { data, status: 200 };
}

export async function cancelBooking(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  userId: string,
  newStatus: BookingStatus
): Promise<ServiceResult<BookingRow>> {
  const { data: booking } = await supabase
    .from('booking_requests')
    .select('*')
    .eq('id', bookingId)
    .single();

  if (!booking) {
    return { error: 'Booking not found', status: 404 };
  }

  if (!validateStateTransition(booking.status, newStatus)) {
    return {
      error: `Cannot transition from "${booking.status}" to "${newStatus}"`,
      status: 400,
    };
  }

  const { data, error } = await supabase
    .from('booking_requests')
    .update({ status: newStatus })
    .eq('id', bookingId)
    .select()
    .single();

  if (error) {
    return { error: 'Failed to update booking', status: 500 };
  }

  return { data, status: 200 };
}

export async function expireStaleRequests(supabase: SupabaseClient<Database>): Promise<number> {
  const { data } = await supabase.rpc('expire_stale_booking_requests');
  return (data as number) ?? 0;
}
