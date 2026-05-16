/**
 * notifications.service.ts
 *
 * Sub-project F · Phase F1 — service layer for in-app notifications.
 *
 * Exposes:
 *   - createNotification()       — generic low-level insert
 *   - notifyXxx()                — 12 typed helpers, one per notification type
 *
 * All calls are intended to be fire-and-forget at the call site:
 *   void (async () => { notifyXxx(supabase, userId, payload); })();
 *
 * Failures are logged via logger.error (→ Sentry) and never propagate to the
 * caller. The parent booking transition still succeeds even if a notify fails.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, NotificationType } from '@/types/database.types';
import { logger } from '@/lib/logger';

// ─── Core Insert ─────────────────────────────────────────────────

export interface CreateNotificationInput {
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  metadata?: Record<string, unknown>;
}

export async function createNotification(
  supabase: SupabaseClient<Database>,
  input: CreateNotificationInput
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: input.user_id,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link ?? null,
      metadata: input.metadata ?? {},
    })
    .select('id')
    .single();

  if (error) {
    logger.error('createNotification failed', error, {
      type: input.type,
      user_id: input.user_id,
    });
    return null;
  }

  return data as { id: string };
}

// ─── Typed Helpers ───────────────────────────────────────────────

/** Fired → vendor when a couple submits a new booking request. */
export async function notifyBookingRequestReceived(
  supabase: SupabaseClient<Database>,
  vendorUserId: string,
  payload: {
    bookingId: string;
    coupleName: string;
    packageName: string;
    totalCents: number;
  }
): Promise<void> {
  const dollars = (payload.totalCents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  await createNotification(supabase, {
    user_id: vendorUserId,
    type: 'booking_request_received',
    title: 'New booking request',
    body: `From ${payload.coupleName} — ${payload.packageName} · ${dollars}`,
    link: `/dashboard/bookings/${payload.bookingId}`,
    metadata: {
      booking_id: payload.bookingId,
      package_name: payload.packageName,
      amount_cents: payload.totalCents,
    },
  });
}

/** Fired → couple when vendor accepts (at base price). */
export async function notifyVendorAccepted(
  supabase: SupabaseClient<Database>,
  coupleUserId: string,
  payload: {
    bookingId: string;
    vendorName: string;
    totalCents: number;
  }
): Promise<void> {
  const dollars = (payload.totalCents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  await createNotification(supabase, {
    user_id: coupleUserId,
    type: 'vendor_accepted',
    title: 'Vendor accepted your booking',
    body: `${payload.vendorName} confirmed · ${dollars} — pay deposit to lock in your date`,
    link: `/dashboard/bookings/${payload.bookingId}`,
    metadata: {
      booking_id: payload.bookingId,
      amount_cents: payload.totalCents,
    },
  });
}

/** Fired → couple when vendor sends an adjusted quote. */
export async function notifyVendorAdjustedQuote(
  supabase: SupabaseClient<Database>,
  coupleUserId: string,
  payload: {
    bookingId: string;
    vendorName: string;
    newTotalCents: number;
    reason: string;
  }
): Promise<void> {
  const dollars = (payload.newTotalCents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  await createNotification(supabase, {
    user_id: coupleUserId,
    type: 'vendor_adjusted_quote',
    title: 'Vendor adjusted your quote',
    body: `${payload.vendorName} sent a revised quote · ${dollars} — accept or decline within 72h`,
    link: `/dashboard/bookings/${payload.bookingId}`,
    metadata: {
      booking_id: payload.bookingId,
      amount_cents: payload.newTotalCents,
      reason: payload.reason,
    },
  });
}

/** Fired → vendor when couple accepts the adjusted quote. */
export async function notifyCoupleAcceptedAdjusted(
  supabase: SupabaseClient<Database>,
  vendorUserId: string,
  payload: {
    bookingId: string;
    coupleName: string;
    totalCents: number;
  }
): Promise<void> {
  const dollars = (payload.totalCents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  await createNotification(supabase, {
    user_id: vendorUserId,
    type: 'couple_accepted_adjusted',
    title: 'Couple accepted your adjusted quote',
    body: `${payload.coupleName} accepted ${dollars} — awaiting deposit payment`,
    link: `/dashboard/bookings/${payload.bookingId}`,
    metadata: {
      booking_id: payload.bookingId,
      amount_cents: payload.totalCents,
    },
  });
}

/** Fired → vendor when couple declines the adjusted quote. */
export async function notifyCoupleDeclinedAdjusted(
  supabase: SupabaseClient<Database>,
  vendorUserId: string,
  payload: {
    bookingId: string;
    coupleName: string;
  }
): Promise<void> {
  await createNotification(supabase, {
    user_id: vendorUserId,
    type: 'couple_declined_adjusted',
    title: 'Couple declined your adjusted quote',
    body: `${payload.coupleName} declined — re-quote within 72h or it auto-cancels`,
    link: `/dashboard/bookings/${payload.bookingId}`,
    metadata: { booking_id: payload.bookingId },
  });
}

/** Fired → vendor when a couple's deposit clears. */
export async function notifyDepositPaid(
  supabase: SupabaseClient<Database>,
  vendorUserId: string,
  payload: {
    bookingId: string;
    coupleName: string;
    depositCents: number;
    packageName: string;
  }
): Promise<void> {
  const dollars = (payload.depositCents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  await createNotification(supabase, {
    user_id: vendorUserId,
    type: 'deposit_paid',
    title: 'Deposit received',
    body: `${payload.coupleName} paid ${dollars} deposit for ${payload.packageName}`,
    link: `/dashboard/bookings/${payload.bookingId}`,
    metadata: {
      booking_id: payload.bookingId,
      deposit_cents: payload.depositCents,
      package_name: payload.packageName,
    },
  });
}

/** Fired → couple after deposit clears to confirm their booking is locked in. */
export async function notifyBookingConfirmed(
  supabase: SupabaseClient<Database>,
  coupleUserId: string,
  payload: {
    bookingId: string;
    vendorName: string;
  }
): Promise<void> {
  await createNotification(supabase, {
    user_id: coupleUserId,
    type: 'booking_confirmed',
    title: 'Booking confirmed',
    body: `Your booking with ${payload.vendorName} is confirmed — date locked in`,
    link: `/dashboard/bookings/${payload.bookingId}`,
    metadata: { booking_id: payload.bookingId },
  });
}

/** Fired → couple OR vendor when a booking is auto-cancelled due to 72h expiry. */
export async function notifyBookingAutoCancelled(
  supabase: SupabaseClient<Database>,
  userId: string,
  payload: {
    bookingId: string;
    recipientRole: 'couple' | 'vendor';
  }
): Promise<void> {
  const body =
    payload.recipientRole === 'couple'
      ? 'Your booking was auto-cancelled after 72 hours with no action'
      : 'A booking was auto-cancelled — no deposit was received within 72 hours';
  await createNotification(supabase, {
    user_id: userId,
    type: 'booking_auto_cancelled',
    title: 'Booking auto-cancelled',
    body,
    link: `/dashboard/bookings/${payload.bookingId}`,
    metadata: {
      booking_id: payload.bookingId,
      recipient_role: payload.recipientRole,
    },
  });
}

/** Fired → the other party when one party cancels a booking. */
export async function notifyBookingCancelled(
  supabase: SupabaseClient<Database>,
  otherPartyUserId: string,
  payload: {
    bookingId: string;
    cancellerRole: 'couple' | 'vendor' | 'mutual';
  }
): Promise<void> {
  const who =
    payload.cancellerRole === 'couple'
      ? 'The couple'
      : payload.cancellerRole === 'vendor'
        ? 'The vendor'
        : 'Both parties';
  await createNotification(supabase, {
    user_id: otherPartyUserId,
    type: 'booking_cancelled',
    title: 'Booking cancelled',
    body: `${who} cancelled this booking`,
    link: `/dashboard/bookings/${payload.bookingId}`,
    metadata: {
      booking_id: payload.bookingId,
      canceller_role: payload.cancellerRole,
    },
  });
}

/** Fired → couple AND vendor for each event that auto-completes. */
export async function notifyEventCompleted(
  supabase: SupabaseClient<Database>,
  userId: string,
  payload: {
    bookingId: string;
    eventTypeLabel: string;
    sequence: number;
    eventsCount: number;
  }
): Promise<void> {
  await createNotification(supabase, {
    user_id: userId,
    type: 'event_completed',
    title: 'Event completed',
    body: `${payload.eventTypeLabel} marked complete (${payload.sequence} of ${payload.eventsCount})`,
    link: `/dashboard/bookings/${payload.bookingId}`,
    metadata: {
      booking_id: payload.bookingId,
      event_type_label: payload.eventTypeLabel,
      sequence: payload.sequence,
      events_count: payload.eventsCount,
    },
  });
}

/** Fired → couple AND vendor when all events are done and booking flips to completed. */
export async function notifyBookingCompleted(
  supabase: SupabaseClient<Database>,
  userId: string,
  payload: {
    bookingId: string;
    recipientRole: 'couple' | 'vendor';
  }
): Promise<void> {
  const body =
    payload.recipientRole === 'couple'
      ? 'Your booking is complete — please leave a review for your vendor'
      : 'Booking marked complete — funds will be transferred shortly';
  await createNotification(supabase, {
    user_id: userId,
    type: 'booking_completed',
    title: 'Booking completed',
    body,
    link: `/dashboard/bookings/${payload.bookingId}`,
    metadata: {
      booking_id: payload.bookingId,
      recipient_role: payload.recipientRole,
    },
  });
}

/** Fired → vendor when a couple submits a review. */
export async function notifyReviewReceived(
  supabase: SupabaseClient<Database>,
  vendorUserId: string,
  payload: {
    bookingId: string;
    coupleName: string;
    ratingOverall: number;
  }
): Promise<void> {
  const stars = '★'.repeat(payload.ratingOverall) + '☆'.repeat(5 - payload.ratingOverall);
  await createNotification(supabase, {
    user_id: vendorUserId,
    type: 'review_received',
    title: 'New review',
    body: `${payload.coupleName} left a ${payload.ratingOverall}-star review ${stars}`,
    link: `/dashboard/bookings/${payload.bookingId}`,
    metadata: {
      booking_id: payload.bookingId,
      rating_overall: payload.ratingOverall,
    },
  });
}
