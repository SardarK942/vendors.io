// Sub-project F · Notifications service
//
// createNotification + 13 typed helpers — one per notification type. The
// helpers compose the right title/body/link/metadata from the booking context
// so call sites in booking.service.ts / payment.service.ts don't have to.
//
// All helpers are fire-and-forget: they never throw. On insert error, they
// call logger.error and return null. The caller never blocks on these.
//
// See docs/superpowers/specs/2026-05-16-sub-project-f-notifications-design.md §3.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, NotificationType } from '@/types/database.types';
import { logger } from '@/lib/logger';

type Sb = SupabaseClient<Database>;

interface CreateNotificationInput {
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

function fmtUsd(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

const REASON_LABEL: Record<string, string> = {
  travel: 'travel distance',
  guest_count: 'guest count over package',
  peak_date: 'peak-season date',
  custom: 'custom requirements',
  setup_complexity: 'setup complexity',
  discount: 'a discount',
  other: 'other',
};

export async function createNotification(
  supabase: Sb,
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
      metadata: (input.metadata ?? {}) as Record<string, unknown>,
    })
    .select('id')
    .single();
  if (error || !data) {
    logger.error('createNotification failed', error, {
      type: input.type,
      user_id: input.user_id,
    });
    return null;
  }
  return { id: data.id };
}

// ─── Typed helpers — one per notification type ───────────────────────────────

export function notifyBookingRequestReceived(
  sb: Sb,
  vendorUserId: string,
  ctx: { bookingId: string; coupleName: string; packageName: string; totalCents: number }
): Promise<{ id: string } | null> {
  return createNotification(sb, {
    user_id: vendorUserId,
    type: 'booking_request_received',
    title: 'New booking request',
    body: `From ${ctx.coupleName} for ${ctx.packageName} (${fmtUsd(ctx.totalCents)})`,
    link: `/dashboard/bookings/${ctx.bookingId}`,
    metadata: {
      booking_id: ctx.bookingId,
      package_name: ctx.packageName,
      total_cents: ctx.totalCents,
    },
  });
}

export function notifyVendorAccepted(
  sb: Sb,
  coupleUserId: string,
  ctx: { bookingId: string; vendorName: string; totalCents: number }
): Promise<{ id: string } | null> {
  const depositCents = Math.floor(ctx.totalCents * 0.3);
  return createNotification(sb, {
    user_id: coupleUserId,
    type: 'vendor_accepted',
    title: `${ctx.vendorName} accepted your booking`,
    body: `Pay your deposit (${fmtUsd(depositCents)}) to confirm.`,
    link: `/dashboard/bookings/${ctx.bookingId}`,
    metadata: {
      booking_id: ctx.bookingId,
      vendor_name: ctx.vendorName,
      total_cents: ctx.totalCents,
    },
  });
}

export function notifyVendorAdjustedQuote(
  sb: Sb,
  coupleUserId: string,
  ctx: { bookingId: string; vendorName: string; newTotalCents: number; reason: string }
): Promise<{ id: string } | null> {
  return createNotification(sb, {
    user_id: coupleUserId,
    type: 'vendor_adjusted_quote',
    title: `${ctx.vendorName} sent an adjusted quote`,
    body: `New total: ${fmtUsd(ctx.newTotalCents)} — reason: ${REASON_LABEL[ctx.reason] ?? ctx.reason}`,
    link: `/dashboard/bookings/${ctx.bookingId}`,
    metadata: {
      booking_id: ctx.bookingId,
      new_total_cents: ctx.newTotalCents,
      reason: ctx.reason,
    },
  });
}

export function notifyCoupleAcceptedAdjusted(
  sb: Sb,
  vendorUserId: string,
  ctx: { bookingId: string; coupleName: string; totalCents: number }
): Promise<{ id: string } | null> {
  return createNotification(sb, {
    user_id: vendorUserId,
    type: 'couple_accepted_adjusted',
    title: `${ctx.coupleName} accepted your adjusted quote`,
    body: `Total ${fmtUsd(ctx.totalCents)}. Awaiting deposit.`,
    link: `/dashboard/bookings/${ctx.bookingId}`,
    metadata: {
      booking_id: ctx.bookingId,
      couple_name: ctx.coupleName,
      total_cents: ctx.totalCents,
    },
  });
}

export function notifyCoupleDeclinedAdjusted(
  sb: Sb,
  vendorUserId: string,
  ctx: { bookingId: string; coupleName: string }
): Promise<{ id: string } | null> {
  return createNotification(sb, {
    user_id: vendorUserId,
    type: 'couple_declined_adjusted',
    title: `${ctx.coupleName} declined your adjusted quote`,
    body: 'Send a revised quote within 72h or the booking will auto-cancel.',
    link: `/dashboard/bookings/${ctx.bookingId}`,
    metadata: { booking_id: ctx.bookingId, couple_name: ctx.coupleName },
  });
}

export function notifyDepositPaid(
  sb: Sb,
  vendorUserId: string,
  ctx: { bookingId: string; coupleName: string; depositCents: number; packageName: string }
): Promise<{ id: string } | null> {
  return createNotification(sb, {
    user_id: vendorUserId,
    type: 'deposit_paid',
    title: 'Deposit paid — booking confirmed',
    body: `${ctx.coupleName} paid ${fmtUsd(ctx.depositCents)} for ${ctx.packageName}`,
    link: `/dashboard/bookings/${ctx.bookingId}`,
    metadata: {
      booking_id: ctx.bookingId,
      deposit_cents: ctx.depositCents,
      package_name: ctx.packageName,
    },
  });
}

export function notifyBookingConfirmed(
  sb: Sb,
  coupleUserId: string,
  ctx: { bookingId: string; vendorName: string }
): Promise<{ id: string } | null> {
  return createNotification(sb, {
    user_id: coupleUserId,
    type: 'booking_confirmed',
    title: 'Booking confirmed',
    body: `${ctx.vendorName}'s full address and instructions are now visible.`,
    link: `/dashboard/bookings/${ctx.bookingId}`,
    metadata: { booking_id: ctx.bookingId, vendor_name: ctx.vendorName },
  });
}

export function notifyBookingAutoCancelled(
  sb: Sb,
  userId: string,
  ctx: { bookingId: string; recipientRole: 'couple' | 'vendor' }
): Promise<{ id: string } | null> {
  return createNotification(sb, {
    user_id: userId,
    type: 'booking_auto_cancelled',
    title: 'Booking auto-cancelled',
    body: 'No response within 72 hours — the booking has been cancelled.',
    link: `/dashboard/bookings/${ctx.bookingId}`,
    metadata: { booking_id: ctx.bookingId, recipient_role: ctx.recipientRole },
  });
}

export function notifyBookingCancelled(
  sb: Sb,
  userId: string,
  ctx: { bookingId: string; cancellerRole: 'couple' | 'vendor' | 'mutual' }
): Promise<{ id: string } | null> {
  return createNotification(sb, {
    user_id: userId,
    type: 'booking_cancelled',
    title: 'Booking cancelled',
    body:
      ctx.cancellerRole === 'mutual'
        ? 'Both parties agreed to cancel this booking.'
        : `Cancelled by the ${ctx.cancellerRole}.`,
    link: `/dashboard/bookings/${ctx.bookingId}`,
    metadata: { booking_id: ctx.bookingId, canceller_role: ctx.cancellerRole },
  });
}

export function notifyEventCompleted(
  sb: Sb,
  userId: string,
  ctx: { bookingId: string; eventTypeLabel: string; sequence: number; eventsCount: number }
): Promise<{ id: string } | null> {
  return createNotification(sb, {
    user_id: userId,
    type: 'event_completed',
    title: `Event ${ctx.sequence} of ${ctx.eventsCount} complete`,
    body: `${ctx.eventTypeLabel} marked complete.`,
    link: `/dashboard/bookings/${ctx.bookingId}`,
    metadata: {
      booking_id: ctx.bookingId,
      sequence: ctx.sequence,
      events_count: ctx.eventsCount,
    },
  });
}

export function notifyBookingCompleted(
  sb: Sb,
  userId: string,
  ctx: { bookingId: string; recipientRole: 'couple' | 'vendor' }
): Promise<{ id: string } | null> {
  return createNotification(sb, {
    user_id: userId,
    type: 'booking_completed',
    title: 'Booking complete',
    body:
      ctx.recipientRole === 'couple'
        ? 'All your events are done. Leave a review!'
        : 'All events delivered. Funds will release to your earnings shortly.',
    link: `/dashboard/bookings/${ctx.bookingId}`,
    metadata: { booking_id: ctx.bookingId, recipient_role: ctx.recipientRole },
  });
}

export function notifyReviewReceived(
  sb: Sb,
  vendorUserId: string,
  ctx: { bookingId: string; coupleName: string; ratingOverall: number }
): Promise<{ id: string } | null> {
  return createNotification(sb, {
    user_id: vendorUserId,
    type: 'review_received',
    title: 'New review received',
    body: `${ctx.coupleName} left you a ${ctx.ratingOverall}-star review.`,
    link: `/dashboard/bookings/${ctx.bookingId}`,
    metadata: {
      booking_id: ctx.bookingId,
      couple_name: ctx.coupleName,
      rating_overall: ctx.ratingOverall,
    },
  });
}

export function notifyCustomRequestReceived(
  sb: Sb,
  vendorUserId: string,
  ctx: { bookingId: string; coupleName: string; eventDate: string }
): Promise<{ id: string } | null> {
  return createNotification(sb, {
    user_id: vendorUserId,
    type: 'custom_request_received',
    title: 'New custom request',
    body: `${ctx.coupleName} sent a request for ${ctx.eventDate}. Send a quote to lock it in.`,
    link: `/dashboard/bookings/${ctx.bookingId}`,
    metadata: {
      booking_id: ctx.bookingId,
      event_date: ctx.eventDate,
    },
  });
}

export function notifyCoupleCountered(
  sb: Sb,
  vendorUserId: string,
  ctx: {
    bookingId: string;
    coupleName: string;
    proposedTotalCents: number;
    note?: string;
    vendorAdjustmentsRemaining: 0 | 1 | 2;
  }
): Promise<{ id: string } | null> {
  return createNotification(sb, {
    user_id: vendorUserId,
    type: 'couple_countered',
    title: 'Counter-offer received',
    body: `${ctx.coupleName} sent a counter-offer.`,
    link: `/dashboard/bookings/${ctx.bookingId}`,
    metadata: {
      booking_id: ctx.bookingId,
      proposed_total_cents: ctx.proposedTotalCents,
      vendor_adjustments_remaining: ctx.vendorAdjustmentsRemaining,
    },
  });
}
