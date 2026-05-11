import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { BookingRequestInput, QuoteInput, ServiceResult } from '@/types';
import { sendExpirationEmail, sendBookingAutoCancelEmail } from '@/lib/email/resend';

type BookingRow = Database['public']['Tables']['bookings']['Row'];

// ─── State Machine ──────────────────────────────────────────────
// deposit_paid is the "confirmed" state; vendor acknowledgment is implicit at quote time.
// Refund/claw logic for any *_cancelled transition lives in payment.service.ts.

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['quoted', 'rejected', 'expired', 'couple_cancelled', 'accepted', 'adjusted_quote_sent'],
  quoted: ['deposit_paid', 'couple_cancelled', 'vendor_cancelled', 'expired'],
  // New package-based flow statuses
  accepted: ['deposit_paid', 'couple_cancelled', 'vendor_cancelled', 'expired'],
  adjusted_quote_sent: [
    'accepted',
    'adjusted_quote_declined',
    'couple_cancelled',
    'vendor_cancelled',
    'expired',
  ],
  adjusted_quote_declined: [
    'adjusted_quote_sent',
    'couple_cancelled',
    'vendor_cancelled',
    'expired',
  ],
  deposit_paid: [
    'completed',
    'couple_cancelled',
    'vendor_cancelled',
    'cancelled_mutual',
    'disputed',
  ],
  disputed: ['completed', 'couple_cancelled'], // admin-resolved
  rejected: [],
  completed: [],
  expired: [],
  couple_cancelled: [],
  vendor_cancelled: [],
  cancelled_mutual: [],
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
    .from('bookings')
    .select('id')
    .eq('couple_user_id', coupleUserId)
    .eq('vendor_profile_id', input.vendorProfileId)
    .in('status', ['pending', 'quoted'])
    .single();

  if (existing) {
    return { error: 'You already have an active request with this vendor', status: 409 };
  }

  const { data, error } = await supabase
    .from('bookings')
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
    .from('bookings')
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
    .from('bookings')
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
    .from('bookings')
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
    .from('bookings')
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

export async function rejectBooking(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  vendorUserId: string
): Promise<ServiceResult<BookingRow>> {
  const { data: booking } = await supabase
    .from('bookings')
    .select('*, vendor_profiles!inner(user_id)')
    .eq('id', bookingId)
    .single();

  if (!booking) return { error: 'Booking not found', status: 404 };

  const vp = booking.vendor_profiles as unknown as { user_id: string };
  if (vp.user_id !== vendorUserId) return { error: 'Forbidden', status: 403 };

  if (!validateStateTransition(booking.status, 'rejected')) {
    return {
      error: `Cannot reject booking in "${booking.status}" state`,
      status: 400,
    };
  }

  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'rejected', vendor_responded_at: new Date().toISOString() })
    .eq('id', bookingId)
    .select()
    .single();

  if (error) return { error: 'Failed to reject booking', status: 500 };
  return { data, status: 200 };
}

export async function expireStaleRequests(supabase: SupabaseClient<Database>): Promise<number> {
  const { data: toExpire } = await supabase
    .from('bookings')
    .select(
      'id, couple_email, users!couple_user_id(email), vendor_profiles!inner(business_name, users!user_id(email))'
    )
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString());

  const { data } = await supabase.rpc('expire_stale_booking_requests');

  for (const row of toExpire ?? []) {
    const vp = row.vendor_profiles as unknown as {
      business_name: string;
      users: { email: string } | { email: string }[] | null;
    };
    const vendorUser = Array.isArray(vp.users) ? vp.users[0] : vp.users;
    const coupleUser = Array.isArray(row.users) ? row.users[0] : row.users;
    const coupleEmail = row.couple_email ?? (coupleUser as { email: string } | null)?.email;

    if (coupleEmail) {
      await sendExpirationEmail(coupleEmail, vp.business_name, false);
    }
    if (vendorUser?.email) {
      await sendExpirationEmail(vendorUser.email, vp.business_name, true);
    }
  }

  return (data as number) ?? 0;
}

/**
 * Sweep for bookings in the new-flow statuses that have passed their 72h expiry.
 * Cancels them and fires sendBookingAutoCancelEmail to both parties (fire-and-forget).
 * Handles: accepted (couple never paid deposit), adjusted_quote_sent, adjusted_quote_declined.
 * (pending is handled by the legacy expireStaleRequests + expire_stale_booking_requests RPC.)
 */
export async function autoCancelExpiredBookings(
  supabase: SupabaseClient<Database>
): Promise<number> {
  const now = new Date().toISOString();

  const { data: toCancel } = await supabase
    .from('bookings')
    .select(
      'id, couple_email, users!couple_user_id(email), vendor_profiles!inner(business_name, users!user_id(email))'
    )
    .in('status', ['accepted', 'adjusted_quote_sent', 'adjusted_quote_declined'])
    .lt('expires_at', now);

  if (!toCancel || toCancel.length === 0) return 0;

  const ids = toCancel.map((b) => b.id);

  await supabase
    .from('bookings')
    .update({ status: 'expired', updated_at: now })
    .in('id', ids)
    .in('status', ['accepted', 'adjusted_quote_sent', 'adjusted_quote_declined'])
    .lt('expires_at', now);

  for (const row of toCancel) {
    const vp = row.vendor_profiles as unknown as {
      business_name: string;
      users: { email: string } | { email: string }[] | null;
    };
    const vendorUser = Array.isArray(vp.users) ? vp.users[0] : vp.users;
    const coupleUser = Array.isArray(row.users) ? row.users[0] : row.users;
    const coupleEmail = row.couple_email ?? (coupleUser as { email: string } | null)?.email;

    // Fire-and-forget — email failure must not block the sweep.
    if (coupleEmail) {
      void sendBookingAutoCancelEmail(coupleEmail, 'couple', row.id);
    }
    if (vendorUser?.email) {
      void sendBookingAutoCancelEmail(vendorUser.email, 'vendor', row.id);
    }
  }

  return toCancel.length;
}

// ─── A2.5: Accept booking at base price ──────────────────────────────────────
// Appended by A2 — do not modify above this line.

export async function acceptBooking(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  vendorUserId: string
): Promise<{ data?: BookingRow; error?: { code: string; message: string }; status: number }> {
  // Fetch booking and verify the caller is the vendor
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, vendor_profile_id, status, package_id, vendor_profiles!inner(user_id)')
    .eq('id', bookingId)
    .single();

  if (!booking) return { error: { code: 'NOT_FOUND', message: 'Booking not found' }, status: 404 };

  const vp = booking.vendor_profiles as unknown as { user_id: string };
  if (vp.user_id !== vendorUserId) {
    return { error: { code: 'FORBIDDEN', message: 'Not your booking' }, status: 403 };
  }
  if (booking.status !== 'pending') {
    return {
      error: { code: 'INVALID_STATE', message: `Cannot accept from status ${booking.status}` },
      status: 409,
    };
  }

  // Pull vendor_notes_template from the package (may be null)
  let vendorNotesTemplate: string | null = null;
  if (booking.package_id) {
    const { data: pkg } = await supabase
      .from('packages')
      .select('vendor_notes_template')
      .eq('id', booking.package_id)
      .single();
    vendorNotesTemplate = (pkg as { vendor_notes_template?: string | null } | null)
      ?.vendor_notes_template ?? null;
  }

  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('bookings')
    .update({
      status: 'accepted',
      adjustment_amount_cents: 0,
      vendor_notes: vendorNotesTemplate,
      expires_at: expiresAt,
    })
    .eq('id', bookingId)
    .select('*')
    .single();

  if (error) return { error: { code: 'UPDATE_FAILED', message: error.message }, status: 500 };
  return { data: data as BookingRow, status: 200 };
}

// ─── A2.6: Vendor sends adjusted quote ───────────────────────────────────────
// Appended by A2 — do not modify above this line.

import type { AdjustQuoteInput } from '@/types';

export async function adjustBookingQuote(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  vendorUserId: string,
  input: AdjustQuoteInput
): Promise<{ data?: BookingRow; error?: { code: string; message: string }; status: number }> {
  const { data: booking } = await supabase
    .from('bookings')
    .select(
      'id, vendor_profile_id, status, negotiation_round_count, package_id, vendor_profiles!inner(user_id)'
    )
    .eq('id', bookingId)
    .single();

  if (!booking) return { error: { code: 'NOT_FOUND', message: 'Booking not found' }, status: 404 };

  const vp = booking.vendor_profiles as unknown as { user_id: string };
  if (vp.user_id !== vendorUserId) {
    return { error: { code: 'FORBIDDEN', message: 'Not your booking' }, status: 403 };
  }

  if (!['pending', 'adjusted_quote_declined'].includes(booking.status)) {
    return {
      error: {
        code: 'INVALID_STATE',
        message: `Cannot adjust from status ${booking.status}`,
      },
      status: 409,
    };
  }

  // Pull vendor_notes_template if not yet set
  let vendorNotesTemplate: string | null = null;
  if (booking.package_id) {
    const { data: pkg } = await supabase
      .from('packages')
      .select('vendor_notes_template')
      .eq('id', booking.package_id)
      .single();
    vendorNotesTemplate = (pkg as { vendor_notes_template?: string | null } | null)
      ?.vendor_notes_template ?? null;
  }

  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  const currentRound = booking.negotiation_round_count as number ?? 0;

  const { data, error } = await supabase
    .from('bookings')
    .update({
      status: 'adjusted_quote_sent',
      adjustment_amount_cents: input.adjustment_amount_cents,
      adjustment_reason: input.reason,
      adjustment_explanation: input.explanation ?? null,
      negotiation_round_count: currentRound + 1,
      vendor_notes: vendorNotesTemplate,
      expires_at: expiresAt,
    })
    .eq('id', bookingId)
    .select('*')
    .single();

  if (error) return { error: { code: 'UPDATE_FAILED', message: error.message }, status: 500 };
  return { data: data as BookingRow, status: 200 };
}
