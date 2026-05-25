import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { ServiceResult, CreateBookingInput, AdjustQuoteInput } from '@/types';
import { sendExpirationEmail, sendBookingAutoCancelEmail } from '@/lib/email/resend';
import {
  notifyBookingRequestReceived,
  notifyVendorAccepted,
  notifyVendorAdjustedQuote,
  notifyCoupleAcceptedAdjusted,
  notifyCoupleDeclinedAdjusted,
  notifyBookingAutoCancelled,
} from '@/services/notifications.service';
import { wouldExceedCapacity } from '@/services/availability.service';

type BookingRow = Database['public']['Tables']['bookings']['Row'];

// ─── State Machine ──────────────────────────────────────────────
// deposit_paid is the "confirmed" state; vendor acknowledgment is implicit at quote time.
// Refund/claw logic for any *_cancelled transition lives in payment.service.ts.

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['expired', 'couple_cancelled', 'accepted', 'adjusted_quote_sent'],
  pending_quote: ['adjusted_quote_sent', 'couple_cancelled', 'vendor_cancelled', 'expired'],
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
  completed: [],
  expired: [],
  couple_cancelled: [],
  vendor_cancelled: [],
  cancelled_mutual: [],
};

export function validateStateTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Helper: booking date range from events ─────────────────────

/**
 * Query booking_events for a booking and return:
 * - firstEventDate: MIN(event_date) — used for cancellation deadlines + "before event" checks
 * - lastEventEnd: MAX(event_end_time) — used for "after event" checks + 48h auto-complete cron
 */
export async function getBookingDateRange(
  supabase: SupabaseClient<Database>,
  bookingId: string
): Promise<{ firstEventDate: string | null; lastEventEnd: string | null }> {
  const { data } = await supabase
    .from('booking_events')
    .select('event_date, event_end_time')
    .eq('booking_id', bookingId);

  if (!data || data.length === 0) {
    return { firstEventDate: null, lastEventEnd: null };
  }

  const firstEventDate = data.reduce(
    (min, e) => (e.event_date < min ? e.event_date : min),
    data[0].event_date
  );
  const lastEventEnd = data.reduce(
    (max, e) => (e.event_end_time > max ? e.event_end_time : max),
    data[0].event_end_time
  );

  return { firstEventDate, lastEventEnd };
}

// ─── Service Functions ──────────────────────────────────────────

type BookingStatus = Database['public']['Tables']['bookings']['Row']['status'];

export interface GetBookingRequestsParams {
  status?: BookingStatus[];
  q?: string;
  cursor?: string; // ISO timestamp for cursor-based pagination
  limit?: number; // default 100 (existing behavior); pages use 25
  sort?: 'created_at' | 'updated_at';
}

export interface GetBookingRequestsResult<T> extends ServiceResult<T> {
  nextCursor?: string;
}

export async function getBookingRequests(
  supabase: SupabaseClient<Database>,
  userId: string,
  role: 'couple' | 'vendor',
  params: GetBookingRequestsParams = {}
): Promise<GetBookingRequestsResult<BookingRow[]>> {
  const { status, q, cursor, limit = 100, sort = 'created_at' } = params;

  let query = supabase
    .from('bookings')
    .select('*, vendor_profiles(business_name, slug, category, payment_mode)');

  if (role === 'couple') {
    query = query.eq('couple_user_id', userId);
  } else {
    // Vendor: get bookings for their profile
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

  if (status && status.length > 0) query = query.in('status', status);
  if (q) query = query.ilike('couple_full_name', `%${q}%`);
  if (cursor) query = query.lt(sort, cursor);

  // Fetch limit+1 to detect "has more" without a second count query.
  const { data, error } = await query.order(sort, { ascending: false }).limit(limit + 1);

  if (error) {
    return { error: 'Failed to fetch bookings', status: 500 };
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const trimmed = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore
    ? (trimmed[trimmed.length - 1] as unknown as Record<string, string>)[sort]
    : undefined;

  return { data: trimmed, status: 200, nextCursor };
}

// ─── Operations Block (next 30 days bucketed) ───────────────────

export interface OperationsEvent {
  id: string;
  booking_id: string;
  sequence: number;
  event_date: string;
  event_start_time: string;
  event_end_time: string;
  event_type_label: string;
  location_name: string | null;
  address_line_1: string | null;
  city: string | null;
  couple_full_name: string | null;
  package_label: string | null;
  status: string;
}

export interface OperationsBuckets {
  today: OperationsEvent[];
  tomorrow: OperationsEvent[];
  thisWeek: OperationsEvent[];
  later: OperationsEvent[];
}

export async function getOperationsBuckets(
  supabase: SupabaseClient<Database>,
  vendorProfileId: string,
  daysAhead = 30
): Promise<OperationsBuckets> {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrowStr = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
  const weekEndStr = new Date(now.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
  const endStr = new Date(now.getTime() + daysAhead * 86_400_000).toISOString().slice(0, 10);

  const { data } = await supabase
    .from('booking_events')
    .select(
      `id, booking_id, sequence, event_date, event_start_time, event_end_time, event_type_label,
       location_name, address_line_1, city,
       bookings!inner(vendor_profile_id, status, couple_full_name, package_name_snapshot)`
    )
    .eq('bookings.vendor_profile_id', vendorProfileId)
    .in('bookings.status', ['deposit_paid', 'completed'])
    .gte('event_date', todayStr)
    .lte('event_date', endStr)
    .order('event_date', { ascending: true });

  const rows: OperationsEvent[] = (data ?? []).map((r) => {
    const b = r.bookings as unknown as {
      status: string;
      couple_full_name: string | null;
      package_name_snapshot: string | null;
    };
    return {
      id: r.id as string,
      booking_id: r.booking_id as string,
      sequence: r.sequence as number,
      event_date: r.event_date as string,
      event_start_time: r.event_start_time as string,
      event_end_time: r.event_end_time as string,
      event_type_label: r.event_type_label as string,
      location_name: (r.location_name as string | null) ?? null,
      address_line_1: (r.address_line_1 as string | null) ?? null,
      city: (r.city as string | null) ?? null,
      couple_full_name: b.couple_full_name,
      package_label: b.package_name_snapshot,
      status: b.status,
    };
  });

  return {
    today: rows.filter((r) => r.event_date === todayStr),
    tomorrow: rows.filter((r) => r.event_date === tomorrowStr),
    thisWeek: rows.filter((r) => r.event_date > tomorrowStr && r.event_date <= weekEndStr),
    later: rows.filter((r) => r.event_date > weekEndStr),
  };
}

export async function getBookingById(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  _userId: string
): Promise<ServiceResult<BookingRow>> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, vendor_profiles(business_name, slug, category, user_id, payment_mode)')
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
      'id, couple_user_id, couple_email, users!couple_user_id(email), vendor_profiles!inner(user_id, business_name, users!user_id(email))'
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
      user_id: string;
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

    // In-app notifications — fire-and-forget alongside emails.
    if (row.couple_user_id) {
      void notifyBookingAutoCancelled(supabase, row.couple_user_id, {
        bookingId: row.id,
        recipientRole: 'couple',
      });
    }
    if (vp.user_id) {
      void notifyBookingAutoCancelled(supabase, vp.user_id, {
        bookingId: row.id,
        recipientRole: 'vendor',
      });
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
    vendorNotesTemplate =
      (pkg as { vendor_notes_template?: string | null } | null)?.vendor_notes_template ?? null;
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

  // G5.2 — The sync_booking_calendar_holds trigger fires after this UPDATE.
  // If it inserts a hold that exceeds capacity it raises 'calendar_capacity_exceeded'.
  // Supabase surfaces the RAISE text in error.message.
  if (error) {
    if (error.message?.includes('calendar_capacity_exceeded')) {
      return {
        error: {
          code: 'CALENDAR_CONFLICT',
          message:
            'This booking conflicts with another at the same time. Increase your concurrent capacity in /dashboard/profile/calendar or decline this request.',
        },
        status: 409,
      };
    }
    return { error: { code: 'UPDATE_FAILED', message: error.message }, status: 500 };
  }

  // Notify couple that vendor accepted — fire-and-forget.
  void (async () => {
    const { data: ctx } = await supabase
      .from('bookings')
      .select('couple_user_id, total_price_cents, vendor_profiles!inner(business_name)')
      .eq('id', bookingId)
      .single();
    if (!ctx) return;
    const vCtx = ctx.vendor_profiles as unknown as { business_name: string } | null;
    if (!ctx.couple_user_id) return;
    notifyVendorAccepted(supabase, ctx.couple_user_id, {
      bookingId,
      vendorName: vCtx?.business_name ?? 'Your vendor',
      totalCents: ((ctx as Record<string, unknown>).total_price_cents as number) ?? 0,
    });
  })();

  return { data: data as BookingRow, status: 200 };
}

// ─── A2.6: Vendor sends adjusted quote ───────────────────────────────────────
// Appended by A2 — do not modify above this line.

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

  if (!['pending', 'pending_quote', 'adjusted_quote_declined'].includes(booking.status)) {
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
    vendorNotesTemplate =
      (pkg as { vendor_notes_template?: string | null } | null)?.vendor_notes_template ?? null;
  }

  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  const currentRound = (booking.negotiation_round_count as number) ?? 0;

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

  // Notify couple that vendor adjusted the quote — fire-and-forget.
  void (async () => {
    const { data: ctx } = await supabase
      .from('bookings')
      .select('couple_user_id, total_price_cents, vendor_profiles!inner(business_name)')
      .eq('id', bookingId)
      .single();
    if (!ctx) return;
    const vCtx = ctx.vendor_profiles as unknown as { business_name: string } | null;
    if (!ctx.couple_user_id) return;
    notifyVendorAdjustedQuote(supabase, ctx.couple_user_id, {
      bookingId,
      vendorName: vCtx?.business_name ?? 'Your vendor',
      newTotalCents: ((ctx as Record<string, unknown>).total_price_cents as number) ?? 0,
      reason: input.reason,
    });
  })();

  return { data: data as BookingRow, status: 200 };
}

// ─── Phase A3: New Booking (Package-driven) ──────────────────────────────────

export async function createBooking(
  supabase: SupabaseClient<Database>,
  coupleUserId: string,
  input: CreateBookingInput
): Promise<ServiceResult<{ booking: Record<string, unknown>; events: Record<string, unknown>[] }>> {
  // Fetch package + verify it's active
  const { data: pkg } = await supabase
    .from('packages')
    .select('id, name, base_price_cents, events_count, is_active')
    .eq('id', input.package_id)
    .single();

  if (!pkg || !pkg.is_active) {
    return { error: 'Package not available', status: 400 };
  }

  if (input.events.length > pkg.events_count) {
    return { error: `Package supports up to ${pkg.events_count} events`, status: 400 };
  }

  // Validate addons belong to package
  if (input.selected_addons.length > 0) {
    const addonIds = input.selected_addons.map((a) => a.addon_id);
    const { data: validAddons } = await supabase
      .from('package_addons')
      .select('id')
      .eq('package_id', input.package_id)
      .in('id', addonIds);
    if ((validAddons?.length ?? 0) !== addonIds.length) {
      return { error: 'One or more add-ons do not belong to this package', status: 400 };
    }
  }

  // G5.1 — Pre-check capacity for every proposed event before INSERT.
  // event_start_time / event_end_time are full ISO datetime strings (Zod .datetime()).
  // Extract 'HH:mm' for wouldExceedCapacity which expects date + time strings.
  for (const evt of input.events) {
    const startHHmm = new Date(evt.event_start_time).toISOString().slice(11, 16);
    const endHHmm = new Date(evt.event_end_time).toISOString().slice(11, 16);
    const check = await wouldExceedCapacity(
      supabase,
      input.vendor_profile_id,
      evt.event_date,
      startHHmm,
      endHHmm
    );
    if (check.wouldExceed) {
      return {
        error: `Conflict on ${evt.event_date} ${startHHmm}–${endHHmm}. This vendor is already booked at that time. Try another date or time.`,
        status: 409,
      };
    }
  }

  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

  // Insert booking
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      couple_user_id: coupleUserId,
      vendor_profile_id: input.vendor_profile_id,
      package_id: input.package_id,
      package_name_snapshot: pkg.name,
      package_base_price_cents_snapshot: pkg.base_price_cents,
      selected_addons:
        input.selected_addons as unknown as Database['public']['Tables']['bookings']['Insert']['selected_addons'],
      guest_count: input.guest_count,
      special_requests: input.special_requests ?? null,
      couple_full_name: input.couple_full_name,
      couple_contact_phone: input.couple_contact_phone,
      status: 'pending',
      expires_at: expiresAt,
      negotiation_round_count: 0,
    })
    .select('*')
    .single();

  if (bookingError || !booking) {
    return { error: bookingError?.message ?? 'Failed to create booking', status: 500 };
  }

  // Insert booking_events
  const eventRows = input.events.map((e) => ({ ...e, booking_id: booking.id }));
  const { data: events, error: eventsError } = await supabase
    .from('booking_events')
    .insert(eventRows)
    .select('*');

  if (eventsError) {
    // Rollback booking
    await supabase.from('bookings').delete().eq('id', booking.id);
    return { error: eventsError.message, status: 500 };
  }

  // Notify vendor of the new booking request — fire-and-forget.
  void (async () => {
    const { data: ctx } = await supabase
      .from('bookings')
      .select('vendor_profiles!inner(user_id), users!couple_user_id(full_name)')
      .eq('id', booking.id)
      .single();
    if (!ctx) return;
    const vp = ctx.vendor_profiles as unknown as { user_id: string };
    const cu = ctx.users as unknown as { full_name: string | null } | null;
    notifyBookingRequestReceived(supabase, vp.user_id, {
      bookingId: booking.id,
      coupleName: cu?.full_name ?? 'A couple',
      packageName: pkg.name,
      totalCents: ((booking as Record<string, unknown>).total_price_cents as number) ?? 0,
    });
  })();

  return {
    data: { booking: booking as Record<string, unknown>, events: events ?? [] },
    status: 201,
  };
}

// ─── Phase A3: Couple Accept Adjusted Quote ──────────────────────────────────

export async function coupleAcceptAdjusted(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  coupleUserId: string
): Promise<ServiceResult<Record<string, unknown>>> {
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, couple_user_id, status')
    .eq('id', bookingId)
    .single();

  if (!booking) return { error: 'Booking not found', status: 404 };
  if (booking.couple_user_id !== coupleUserId) return { error: 'Forbidden', status: 403 };
  if (booking.status !== 'adjusted_quote_sent') {
    return {
      error: `Cannot accept-adjusted from status: ${booking.status}`,
      status: 409,
    };
  }

  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'accepted', expires_at: expiresAt })
    .eq('id', bookingId)
    .select('*')
    .single();

  if (error || !data) {
    return { error: error?.message ?? 'Update failed', status: 500 };
  }

  // Notify vendor that couple accepted the adjusted quote — fire-and-forget.
  void (async () => {
    const { data: ctx } = await supabase
      .from('bookings')
      .select('total_price_cents, vendor_profiles!inner(user_id), users!couple_user_id(full_name)')
      .eq('id', bookingId)
      .single();
    if (!ctx) return;
    const vp = ctx.vendor_profiles as unknown as { user_id: string } | null;
    if (!vp?.user_id) return;
    const cu = ctx.users as unknown as { full_name: string | null } | null;
    notifyCoupleAcceptedAdjusted(supabase, vp.user_id, {
      bookingId,
      coupleName: cu?.full_name ?? 'The couple',
      totalCents: ((ctx as Record<string, unknown>).total_price_cents as number) ?? 0,
    });
  })();

  return { data: data as unknown as Record<string, unknown>, status: 200 };
}

// ─── Phase A3: Couple Decline Adjusted Quote ─────────────────────────────────

export async function coupleDeclineAdjusted(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  coupleUserId: string
): Promise<ServiceResult<Record<string, unknown>>> {
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, couple_user_id, status')
    .eq('id', bookingId)
    .single();

  if (!booking) return { error: 'Booking not found', status: 404 };
  if (booking.couple_user_id !== coupleUserId) return { error: 'Forbidden', status: 403 };
  if (booking.status !== 'adjusted_quote_sent') {
    return {
      error: `Cannot decline-adjusted from status: ${booking.status}`,
      status: 409,
    };
  }

  // Vendor gets 72h to re-quote
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'adjusted_quote_declined', expires_at: expiresAt })
    .eq('id', bookingId)
    .select('*')
    .single();

  if (error || !data) {
    return { error: error?.message ?? 'Update failed', status: 500 };
  }

  // Notify vendor that couple declined the adjusted quote — fire-and-forget.
  void (async () => {
    const { data: ctx } = await supabase
      .from('bookings')
      .select('vendor_profiles!inner(user_id), users!couple_user_id(full_name)')
      .eq('id', bookingId)
      .single();
    if (!ctx) return;
    const vp = ctx.vendor_profiles as unknown as { user_id: string } | null;
    if (!vp?.user_id) return;
    const cu = ctx.users as unknown as { full_name: string | null } | null;
    notifyCoupleDeclinedAdjusted(supabase, vp.user_id, {
      bookingId,
      coupleName: cu?.full_name ?? 'The couple',
    });
  })();

  return { data: data as unknown as Record<string, unknown>, status: 200 };
}
