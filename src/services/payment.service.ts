import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { CancellerRole, ServiceResult } from '@/types';
import { getBookingDateRange } from '@/services/booking.service';
import { stripe } from '@/lib/stripe/client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { DEPOSIT_RATE, calculatePlatformCut, calculateVendorPending } from '@/lib/utils';
import {
  sendDepositConfirmationEmail,
  sendCompletionEmailToVendor,
  sendReviewRequestEmail,
  sendCancellationEmail,
} from '@/lib/email/resend';
import { sendEventCompletedEmail } from '@/lib/email/event-completed';
import { logger } from '@/lib/logger';
import { deliver } from '@/lib/notifications/deliver';
import {
  notifyDepositPaid,
  notifyBookingConfirmed,
  notifyBookingCancelled,
  notifyEventCompleted,
  notifyBookingCompleted,
} from '@/services/notifications.service';

type TransactionRow = Database['public']['Tables']['transactions']['Row'];

// ─── Deposit Checkout ─────────────────────────────────────────────────────────
// Plain platform charge (no destination, no app fee, immediate capture).
// Baazar retains 100% of the 5% deposit; no Connect transfer to vendor.

export async function createDepositCheckout(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  coupleUserId: string
): Promise<ServiceResult<{ checkoutUrl: string }>> {
  const { data: booking } = await supabase
    .from('bookings')
    .select('*, vendor_profiles!inner(id, business_name)')
    .eq('id', bookingId)
    .eq('couple_user_id', coupleUserId)
    .single();

  if (!booking) return { error: 'Booking not found', status: 404 };
  if (booking.status !== 'accepted') {
    return { error: 'Booking must be in "accepted" state to pay deposit', status: 400 };
  }
  if (!booking.total_price_cents) return { error: 'No price set on booking', status: 400 };

  const vp = booking.vendor_profiles as unknown as {
    id: string;
    business_name: string;
  };

  // Compute the deposit amount — uniform 5% of the booking total.
  // Baazar retains 100% of the deposit; no Connect transfer to vendor.
  const depositAmount = Math.round(booking.total_price_cents * DEPOSIT_RATE);
  const platformCut = calculatePlatformCut(depositAmount, 'cash');
  const vendorPending = calculateVendorPending(depositAmount, 'cash');

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Booking Deposit — ${vp.business_name}`,
              description: `Deposit for booking with ${vp.business_name}`,
            },
            unit_amount: depositAmount,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        metadata: {
          booking_id: bookingId,
          vendor_profile_id: vp.id,
          vendor_pending_cents: vendorPending.toString(),
          platform_cut_cents: platformCut.toString(),
          deferred_onboarding: 'true',
        },
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/bookings/${bookingId}?payment=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/bookings/${bookingId}?payment=cancelled`,
      metadata: { booking_id: bookingId },
    },
    { idempotencyKey: `booking:${bookingId}:checkout` }
  );

  return { data: { checkoutUrl: session.url! }, status: 200 };
}

// ─── Webhook Handlers ─────────────────────────────────────────────────────────

export async function handlePaymentSuccess(
  supabase: SupabaseClient<Database>,
  paymentIntentId: string,
  bookingId: string,
  amount: number
): Promise<void> {
  const platformCut = calculatePlatformCut(amount);
  const vendorPending = calculateVendorPending(amount);

  await supabase
    .from('bookings')
    .update({
      status: 'deposit_paid',
      deposit_amount: amount,
      deposit_paid_at: new Date().toISOString(),
      stripe_payment_intent_id: paymentIntentId,
      couple_contact_revealed: true,
    })
    .eq('id', bookingId);

  await supabase.from('transactions').insert({
    booking_request_id: bookingId,
    stripe_payment_intent_id: paymentIntentId,
    amount,
    platform_fee: platformCut,
    vendor_payout: vendorPending,
    status: 'authorized',
  });

  const { data: ctx } = await supabase
    .from('bookings')
    .select(
      'couple_email, couple_user_id, users!couple_user_id(email), vendor_profiles!inner(business_name, users!user_id(email))'
    )
    .eq('id', bookingId)
    .single();

  if (ctx) {
    const vp = ctx.vendor_profiles as unknown as {
      business_name: string;
      users: { email: string } | { email: string }[] | null;
    };
    const vendorUser = Array.isArray(vp.users) ? vp.users[0] : vp.users;
    const coupleUser = Array.isArray(ctx.users) ? ctx.users[0] : ctx.users;
    const coupleEmail = ctx.couple_email ?? (coupleUser as { email: string } | null)?.email;

    if (coupleEmail) {
      await deliver(
        'email',
        () => sendDepositConfirmationEmail(coupleEmail!, vp.business_name, amount, false),
        { booking_id: bookingId }
      );
    }
    if (vendorUser?.email) {
      await deliver(
        'email',
        () => sendDepositConfirmationEmail(vendorUser!.email, vp.business_name, amount, true),
        { booking_id: bookingId }
      );
    }

    // In-app notifications — detached from webhook critical path so Stripe isn't
    // blocked on DB latency. deliver() still catches and logs failures internally.
    void (async () => {
      const { data: notifyCtx } = await supabase
        .from('bookings')
        .select(
          'couple_user_id, package_name_snapshot, users!couple_user_id(full_name), vendor_profiles!inner(user_id, business_name)'
        )
        .eq('id', bookingId)
        .single();
      if (notifyCtx) {
        const nvp = notifyCtx.vendor_profiles as unknown as {
          user_id: string;
          business_name: string;
        };
        const ncu = notifyCtx.users as unknown as { full_name: string | null } | null;
        const coupleName = ncu?.full_name ?? 'The couple';
        const packageName = notifyCtx.package_name_snapshot ?? 'Package';
        await deliver(
          'notify',
          () =>
            notifyDepositPaid(supabase, nvp.user_id, {
              bookingId,
              coupleName,
              depositCents: amount,
              packageName,
            }),
          { booking_id: bookingId }
        );
        await deliver(
          'notify',
          () =>
            notifyBookingConfirmed(supabase, notifyCtx.couple_user_id, {
              bookingId,
              vendorName: nvp.business_name,
            }),
          { booking_id: bookingId }
        );
      }
    })();
  }
}

export async function handlePaymentFailure(
  supabase: SupabaseClient<Database>,
  paymentIntentId: string,
  bookingId: string
): Promise<void> {
  await supabase.from('transactions').insert({
    booking_request_id: bookingId,
    stripe_payment_intent_id: paymentIntentId,
    amount: 0,
    platform_fee: 0,
    vendor_payout: 0,
    status: 'failed',
  });
}

export async function handleChargeRefunded(
  supabase: SupabaseClient<Database>,
  paymentIntentId: string,
  amountRefunded: number,
  totalAmount: number
): Promise<void> {
  // Idempotent: only update if not already marked refunded. Refund initiated out-of-band
  // (e.g., via Stripe Dashboard) should still sync into our ledger.
  const isFullRefund = amountRefunded >= totalAmount;

  // If the vendor share was already transferred out, reverse it before marking refunded.
  // Without this, the platform is short by the vendor share.
  const { data: tx } = await supabase
    .from('transactions')
    .select('id, stripe_transfer_id, transferred_at, refunded_at, vendor_payout')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .is('refunded_at', null)
    .maybeSingle();

  if (tx?.stripe_transfer_id && tx.transferred_at) {
    try {
      const reversalAmount = Math.round((tx.vendor_payout * amountRefunded) / totalAmount);
      await stripe.transfers.createReversal(
        tx.stripe_transfer_id,
        { amount: reversalAmount },
        { idempotencyKey: `tx:${tx.id}:transfer-reversal` }
      );
    } catch (err) {
      // Log and continue — we still want the ledger to reflect the refund even if reversal fails.
      logger.error('transfer reversal failed', err, {
        site: 'handleChargeRefunded',
        transferId: tx.stripe_transfer_id,
        txId: tx.id,
      });
    }
  }

  await supabase
    .from('transactions')
    .update({
      status: isFullRefund ? 'refunded' : 'partial_refund',
      refunded_at: new Date().toISOString(),
      refund_amount_cents: amountRefunded,
    })
    .eq('stripe_payment_intent_id', paymentIntentId)
    .is('refunded_at', null);
}

// ─── Refund Policy ────────────────────────────────────────────────────────────
// Single source of truth for the Bucket F single-mode cancellation policy.
// Under the 5%-deposit-only model the vendor never holds platform funds, so
// vendorKeepPct is always 0 and clawVendorOtherPending is always false.

interface RefundPolicy {
  coupleRefundPct: number; // 0 or 1 fraction of deposit returned to couple
  vendorKeepPct: number; // always 0 — vendor has no deposit share
  platformKeepPct: number; // 0 or 1 fraction of deposit retained by platform
  clawVendorOtherPending: boolean; // always false — no vendor pending under single-mode
}

export function computeRefundPolicy(
  cancellerRole: CancellerRole,
  bookingStatus: string,
  depositPaidAt: string | null,
  now: Date = new Date()
): RefundPolicy {
  if (bookingStatus !== 'deposit_paid') {
    return {
      coupleRefundPct: 0,
      vendorKeepPct: 0,
      platformKeepPct: 0,
      clawVendorOtherPending: false,
    };
  }

  // Vendor cancellation OR mutual cancellation → full refund to couple.
  if (cancellerRole === 'vendor' || cancellerRole === 'mutual') {
    return {
      coupleRefundPct: 1.0,
      vendorKeepPct: 0,
      platformKeepPct: 0,
      clawVendorOtherPending: false,
    };
  }

  // Customer cancellation — 24h cooling-off window measured from deposit payment.
  const hoursSinceDeposit = depositPaidAt
    ? (now.getTime() - new Date(depositPaidAt).getTime()) / 36e5
    : Infinity;

  if (hoursSinceDeposit < 24) {
    // Within 24h: full refund.
    return {
      coupleRefundPct: 1.0,
      vendorKeepPct: 0,
      platformKeepPct: 0,
      clawVendorOtherPending: false,
    };
  }

  // After 24h: deposit is non-refundable; platform retains 100%.
  return {
    coupleRefundPct: 0,
    vendorKeepPct: 0,
    platformKeepPct: 1.0,
    clawVendorOtherPending: false,
  };
}

// ─── Cancellation ─────────────────────────────────────────────────────────────

export async function cancelBooking(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  cancellerUserId: string,
  cancellerRole: CancellerRole,
  reason: string | null = null,
  fault: 'none' | 'vendor_fault' | 'force_majeure' = 'none'
): Promise<ServiceResult<{ refund_amount_cents: number; new_status: string }>> {
  const { data: booking } = await supabase
    .from('bookings')
    .select('*, vendor_profiles!inner(id, user_id), transactions(*)')
    .eq('id', bookingId)
    .single();

  if (!booking) return { error: 'Booking not found', status: 404 };

  const vp = booking.vendor_profiles as unknown as {
    id: string;
    user_id: string;
  };
  const isCouple = booking.couple_user_id === cancellerUserId;
  const isVendor = vp.user_id === cancellerUserId;

  if (cancellerRole === 'couple' && !isCouple) return { error: 'Forbidden', status: 403 };
  if (cancellerRole === 'vendor' && !isVendor) return { error: 'Forbidden', status: 403 };
  if (cancellerRole === 'mutual' && !isCouple && !isVendor)
    return { error: 'Forbidden', status: 403 };

  // Couple cancellations never carry vendor fault.
  const effectiveFault = cancellerRole === 'couple' ? 'none' : fault;

  const newStatus =
    cancellerRole === 'couple'
      ? 'couple_cancelled'
      : cancellerRole === 'vendor'
        ? 'vendor_cancelled'
        : 'cancelled_mutual';

  // Atomic status flip — only succeeds if booking is still in a cancellable state.
  // Prevents concurrent cancels from both issuing refunds.
  const { data: lockRows } = await supabase
    .from('bookings')
    .update({
      status: newStatus,
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason,
      cancellation_fault: effectiveFault,
    })
    .eq('id', bookingId)
    .in('status', [
      'pending',
      'accepted',
      'adjusted_quote_sent',
      'adjusted_quote_declined',
      'deposit_paid',
    ])
    .select('id');

  if (!lockRows || lockRows.length === 0) {
    return {
      error: 'Booking is no longer cancellable (already cancelled or completed)',
      status: 409,
    };
  }

  // Pre-deposit: no money to move.
  const preDepositStatuses = [
    'pending',
    'accepted',
    'adjusted_quote_sent',
    'adjusted_quote_declined',
  ];
  if (preDepositStatuses.includes(booking.status)) {
    return { data: { refund_amount_cents: 0, new_status: newStatus }, status: 200 };
  }

  const policy = computeRefundPolicy(
    cancellerRole,
    booking.status,
    booking.deposit_paid_at,
    new Date()
  );

  const transactions = (booking.transactions as TransactionRow[]) ?? [];
  const activeTx = transactions.find((t) => ['authorized', 'recognized'].includes(t.status));

  let refundAmount = 0;

  if (activeTx) {
    refundAmount = Math.round(activeTx.amount * policy.coupleRefundPct);

    if (refundAmount > 0) {
      await stripe.refunds.create(
        {
          payment_intent: activeTx.stripe_payment_intent_id,
          amount: refundAmount,
        },
        { idempotencyKey: `tx:${activeTx.id}:refund` }
      );
    }

    // Policy-derived split adjustment — applied regardless of refund amount.
    // Webhook (handleChargeRefunded) owns status/refunded_at/refund_amount_cents/stripe_refund_id.
    await supabase
      .from('transactions')
      .update({
        vendor_payout: Math.round(activeTx.vendor_payout * policy.vendorKeepPct),
        platform_fee: Math.round(activeTx.platform_fee * policy.platformKeepPct),
      })
      .eq('id', activeTx.id);

    if (policy.clawVendorOtherPending) {
      await clawVendorPending(supabase, vp.id, activeTx.vendor_payout);
    }
  }

  await notifyCancellation(supabase, bookingId, cancellerRole, refundAmount, reason);

  return { data: { refund_amount_cents: refundAmount, new_status: newStatus }, status: 200 };
}

async function notifyCancellation(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  cancellerRole: CancellerRole,
  refundCents: number,
  reason: string | null
): Promise<void> {
  const { data: ctx } = await supabase
    .from('bookings')
    .select(
      'couple_user_id, couple_email, users!couple_user_id(email), vendor_profiles!inner(user_id, business_name, users!user_id(email))'
    )
    .eq('id', bookingId)
    .single();

  if (!ctx) return;

  const vp = ctx.vendor_profiles as unknown as {
    user_id: string;
    business_name: string;
    users: { email: string } | { email: string }[] | null;
  };
  const vendorUser = Array.isArray(vp.users) ? vp.users[0] : vp.users;
  const coupleUser = Array.isArray(ctx.users) ? ctx.users[0] : ctx.users;
  const coupleEmail = ctx.couple_email ?? (coupleUser as { email: string } | null)?.email;

  if (coupleEmail) {
    await sendCancellationEmail(
      coupleEmail,
      vp.business_name,
      cancellerRole,
      'couple',
      refundCents,
      reason
    );
  }
  if (vendorUser?.email) {
    await sendCancellationEmail(
      vendorUser.email,
      vp.business_name,
      cancellerRole,
      'vendor',
      refundCents,
      reason
    );
  }

  // In-app notification — notify the other party about the cancellation.
  if (cancellerRole === 'couple' && vp.user_id) {
    // Vendor is the other party.
    await deliver(
      'notify',
      () => notifyBookingCancelled(supabase, vp.user_id, { bookingId, cancellerRole }),
      { booking_id: bookingId }
    );
  } else if (cancellerRole === 'vendor' && ctx.couple_user_id) {
    // Couple is the other party.
    await deliver(
      'notify',
      () => notifyBookingCancelled(supabase, ctx.couple_user_id, { bookingId, cancellerRole }),
      { booking_id: bookingId }
    );
  } else if (cancellerRole === 'mutual') {
    // Notify both parties (each is the "other party").
    if (ctx.couple_user_id) {
      await deliver(
        'notify',
        () => notifyBookingCancelled(supabase, ctx.couple_user_id, { bookingId, cancellerRole }),
        { booking_id: bookingId }
      );
    }
    if (vp.user_id) {
      await deliver(
        'notify',
        () => notifyBookingCancelled(supabase, vp.user_id, { bookingId, cancellerRole }),
        { booking_id: bookingId }
      );
    }
  }
}

// ─── Vendor Claw + Freeze ─────────────────────────────────────────────────────

export async function clawVendorPending(
  supabase: SupabaseClient<Database>,
  vendorProfileId: string,
  amountCents: number
): Promise<void> {
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id')
    .eq('vendor_profile_id', vendorProfileId);

  const bookingIds = (bookings ?? []).map((b) => b.id);
  if (bookingIds.length === 0) return;

  const { data: txs } = await supabase
    .from('transactions')
    .select('*')
    .in('booking_request_id', bookingIds)
    .in('status', ['earned', 'recognized', 'authorized'])
    .is('transferred_at', null)
    .order('created_at', { ascending: true });

  let remaining = amountCents;
  for (const tx of txs ?? []) {
    if (remaining <= 0) break;
    const deduct = Math.min(tx.vendor_payout, remaining);
    await supabase
      .from('transactions')
      .update({ vendor_payout: tx.vendor_payout - deduct })
      .eq('id', tx.id);
    remaining -= deduct;
  }

  if (remaining > 0) {
    logger.warn('insufficient pending to fully claw', {
      site: 'clawVendorPending',
      vendorProfileId,
      shortfall: remaining,
    });
  }
}

// ─── Completion ───────────────────────────────────────────────────────────────

export async function completeBooking(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  coupleUserId: string
): Promise<ServiceResult<{ status: string }>> {
  const { data: booking } = await supabase
    .from('bookings')
    .select('couple_user_id, status')
    .eq('id', bookingId)
    .single();

  if (!booking) return { error: 'Booking not found', status: 404 };
  if (booking.couple_user_id !== coupleUserId) return { error: 'Forbidden', status: 403 };
  if (booking.status !== 'deposit_paid') {
    return { error: `Cannot complete booking in "${booking.status}" state`, status: 400 };
  }

  // Use last event end time so multi-day bookings can only be completed after all events.
  const { lastEventEnd } = await getBookingDateRange(supabase, bookingId);
  const now = new Date();
  if (lastEventEnd && new Date(lastEventEnd) > now) {
    return { error: 'Cannot complete a booking before all events have ended', status: 400 };
  }

  // Trigger on_booking_completed handles transaction updates (authorized/recognized → earned).
  await supabase
    .from('bookings')
    .update({ status: 'completed', completed_at: now.toISOString() })
    .eq('id', bookingId);

  await sendCompletionEmails(supabase, bookingId);

  return { data: { status: 'completed' }, status: 200 };
}

// ─── Dispute ──────────────────────────────────────────────────────────────────
// Couple flags an issue after event. Freezes auto-complete, notifies admin, holds
// funds in escrow until admin resolves (via SQL for MVP).

export async function disputeBooking(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  coupleUserId: string,
  reason: string
): Promise<ServiceResult<{ status: string }>> {
  const { data: booking } = await supabase
    .from('bookings')
    .select('couple_user_id, status')
    .eq('id', bookingId)
    .single();

  if (!booking) return { error: 'Booking not found', status: 404 };
  if (booking.couple_user_id !== coupleUserId) return { error: 'Forbidden', status: 403 };
  if (booking.status !== 'deposit_paid') {
    return { error: `Cannot dispute booking in "${booking.status}" state`, status: 400 };
  }

  // Can only dispute after the first event has started.
  const { firstEventDate } = await getBookingDateRange(supabase, bookingId);
  const today = new Date().toISOString().slice(0, 10);
  if (firstEventDate && firstEventDate > today) {
    return { error: 'Cannot dispute a booking before the event date', status: 400 };
  }

  const { data: lockRows } = await supabase
    .from('bookings')
    .update({
      status: 'disputed',
      disputed_at: new Date().toISOString(),
      dispute_reason: reason,
    })
    .eq('id', bookingId)
    .eq('status', 'deposit_paid')
    .select('id');

  if (!lockRows || lockRows.length === 0) {
    return { error: 'Booking state changed, retry', status: 409 };
  }

  return { data: { status: 'disputed' }, status: 200 };
}

async function sendCompletionEmails(
  supabase: SupabaseClient<Database>,
  bookingId: string
): Promise<void> {
  const { data: ctx } = await supabase
    .from('bookings')
    .select(
      'couple_email, users!couple_user_id(email), transactions(vendor_payout), vendor_profiles!inner(business_name, users!user_id(email))'
    )
    .eq('id', bookingId)
    .single();

  if (!ctx) return;

  const vp = ctx.vendor_profiles as unknown as {
    business_name: string;
    users: { email: string } | { email: string }[] | null;
  };
  const vendorUser = Array.isArray(vp.users) ? vp.users[0] : vp.users;
  const coupleUser = Array.isArray(ctx.users) ? ctx.users[0] : ctx.users;
  const coupleEmail = ctx.couple_email ?? (coupleUser as { email: string } | null)?.email;
  const vendorPayout =
    (ctx.transactions as { vendor_payout: number }[] | null)?.reduce(
      (sum, tx) => sum + tx.vendor_payout,
      0
    ) ?? 0;

  if (vendorUser?.email) {
    await deliver(
      'email',
      () => sendCompletionEmailToVendor(vendorUser!.email, vp.business_name, vendorPayout),
      { booking_id: bookingId }
    );
  }
  if (coupleEmail) {
    await deliver(
      'email',
      () => sendReviewRequestEmail(coupleEmail!, vp.business_name, bookingId),
      { booking_id: bookingId }
    );
  }
}

// ─── Cron: 24h grace → recognize platform fee ────────────────────────────────

export async function recognizePlatformFees(
  supabase: SupabaseClient<Database>
): Promise<{ recognized: number }> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('transactions')
    .update({
      status: 'recognized',
      platform_fee_recognized_at: new Date().toISOString(),
    })
    .eq('status', 'authorized')
    .lt('created_at', cutoff)
    .select('id');

  return { recognized: data?.length ?? 0 };
}

// ─── Cron: auto-complete past-event bookings (48h after last event_end_time) ─

export async function autoCompleteBookings(
  supabase: SupabaseClient<Database>
): Promise<{ events_completed: number; bookings_completed: number }> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  // Fetch all deposit_paid bookings with their events + user IDs for notifications.
  const { data: bookings } = await supabase
    .from('bookings')
    .select(
      'id, couple_user_id, couple_email, couple_full_name, booking_events(id, event_end_time, event_type_label, sequence, completed_at), vendor_profiles!inner(user_id, business_name)'
    )
    .eq('status', 'deposit_paid');

  let eventsCompleted = 0;
  let bookingsCompleted = 0;

  for (const b of bookings ?? []) {
    const events =
      (b.booking_events as {
        id: string;
        event_end_time: string;
        event_type_label: string;
        sequence: number;
        completed_at: string | null;
      }[]) ?? [];
    const bvp = b.vendor_profiles as unknown as { user_id: string; business_name: string };
    const incomplete = events.filter((e) => !e.completed_at);
    const dueNow = incomplete.filter((e) => e.event_end_time < cutoff);
    if (dueNow.length === 0) continue;

    await supabase
      .from('booking_events')
      .update({ completed_at: now })
      .in(
        'id',
        dueNow.map((e) => e.id)
      );
    eventsCompleted += dueNow.length;

    // Fetch emails for couple + vendor (needed for email sends below).
    const sbAdmin = createServiceRoleClient();
    const coupleEmail =
      (b as unknown as { couple_email: string | null }).couple_email ??
      (b.couple_user_id
        ? (await sbAdmin.auth.admin.getUserById(b.couple_user_id)).data.user?.email
        : undefined);
    const vendorEmailResult = bvp.user_id
      ? (await sbAdmin.auth.admin.getUserById(bvp.user_id)).data.user?.email
      : undefined;
    const vendorDisplayName = bvp.business_name;
    const coupleDisplayName =
      (b as unknown as { couple_full_name: string | null }).couple_full_name ?? 'your couple';

    // Notify both parties for each newly completed event.
    for (const ev of dueNow) {
      const evPayload = {
        bookingId: b.id,
        eventTypeLabel: ev.event_type_label,
        sequence: ev.sequence,
        eventsCount: events.length,
      };
      if (b.couple_user_id) {
        const coupleNotify = await deliver(
          'notify',
          () => notifyEventCompleted(supabase, b.couple_user_id, evPayload),
          { booking_id: b.id }
        );
        if (coupleEmail && coupleNotify?.id) {
          await deliver(
            'email',
            () =>
              sendEventCompletedEmail({
                to: coupleEmail,
                recipientRole: 'couple',
                vendorName: vendorDisplayName,
                coupleName: coupleDisplayName,
                eventTypeLabel: ev.event_type_label,
                sequence: ev.sequence,
                eventsCount: events.length,
                bookingId: b.id,
                notificationId: coupleNotify.id,
              }),
            { booking_id: b.id }
          );
        }
      }
      if (bvp.user_id) {
        const vendorNotify = await deliver(
          'notify',
          () => notifyEventCompleted(supabase, bvp.user_id, evPayload),
          { booking_id: b.id }
        );
        if (vendorEmailResult && vendorNotify?.id) {
          await deliver(
            'email',
            () =>
              sendEventCompletedEmail({
                to: vendorEmailResult,
                recipientRole: 'vendor',
                vendorName: vendorDisplayName,
                coupleName: coupleDisplayName,
                eventTypeLabel: ev.event_type_label,
                sequence: ev.sequence,
                eventsCount: events.length,
                bookingId: b.id,
                notificationId: vendorNotify.id,
              }),
            { booking_id: b.id }
          );
        }
      }
    }

    const stillIncomplete = incomplete.length - dueNow.length;
    if (stillIncomplete === 0) {
      await supabase
        .from('bookings')
        .update({ status: 'completed', completed_at: now })
        .eq('id', b.id);
      bookingsCompleted++;

      // Notify both parties that the entire booking is now complete.
      if (b.couple_user_id) {
        await deliver(
          'notify',
          () =>
            notifyBookingCompleted(supabase, b.couple_user_id, {
              bookingId: b.id,
              recipientRole: 'couple',
            }),
          { booking_id: b.id }
        );
      }
      if (bvp.user_id) {
        await deliver(
          'notify',
          () =>
            notifyBookingCompleted(supabase, bvp.user_id, {
              bookingId: b.id,
              recipientRole: 'vendor',
            }),
          { booking_id: b.id }
        );
      }
    }
  }

  return { events_completed: eventsCompleted, bookings_completed: bookingsCompleted };
}

// ─── Cron: redact couple PII on stale terminal bookings (>90 days) ───────────
// Calls the SECURITY DEFINER SQL function from migration 00013. Contact info is
// nulled in place; the booking row itself is preserved for audit/history.

export async function redactStaleBookingPii(
  supabase: SupabaseClient<Database>,
  retentionDays = 90
): Promise<{ redacted: number }> {
  const { data, error } = await supabase.rpc('redact_stale_booking_pii', {
    retention_days: retentionDays,
  });
  if (error) {
    console.error('[redactStaleBookingPii] rpc failed', error);
    return { redacted: 0 };
  }
  return { redacted: (data as number) ?? 0 };
}

// ─── Earnings + Withdrawals ───────────────────────────────────────────────────

export interface VendorEarnings {
  pending_escrow_cents: number; // authorized + recognized (not yet earned)
  available_cents: number; // earned but not transferred
  transferred_cents: number; // historical
  requires_onboarding: boolean;
  verification_pending: boolean; // details submitted but Stripe hasn't confirmed yet
  stripe_account_id: string | null;
  frozen_reason: string | null;
}

export async function getVendorEarnings(
  supabase: SupabaseClient<Database>,
  vendorUserId: string
): Promise<ServiceResult<VendorEarnings>> {
  const { data: vp } = await supabase
    .from('vendor_profiles')
    .select('id')
    .eq('user_id', vendorUserId)
    .single();

  if (!vp) return { error: 'Vendor profile not found', status: 404 };

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, transactions(status, vendor_payout, transferred_at)')
    .eq('vendor_profile_id', vp.id);

  let pendingEscrow = 0;
  let available = 0;
  let transferred = 0;

  for (const booking of bookings ?? []) {
    const txs = (booking.transactions as TransactionRow[]) ?? [];
    for (const tx of txs) {
      if (tx.transferred_at) {
        transferred += tx.vendor_payout;
      } else if (tx.status === 'earned') {
        available += tx.vendor_payout;
      } else if (tx.status === 'authorized' || tx.status === 'recognized') {
        pendingEscrow += tx.vendor_payout;
      }
    }
  }

  return {
    data: {
      pending_escrow_cents: pendingEscrow,
      available_cents: available,
      transferred_cents: transferred,
      requires_onboarding: false,
      verification_pending: false,
      stripe_account_id: null,
      frozen_reason: null,
    },
    status: 200,
  };
}

// Bucket F: Stripe Connect transfer flow removed — stripe_accounts table dropped.
// initiatePayout is a stub until a replacement withdrawal strategy is defined.
export async function initiatePayout(
  _supabase: SupabaseClient<Database>,
  _vendorUserId: string
): Promise<ServiceResult<{ transferred_cents: number; onboarding_url?: string }>> {
  return { error: 'Withdrawals are not yet available in this version.', status: 503 };
}

// ─── Sub-project E: Payouts ledger ──────────────────────────────────

import type Stripe from 'stripe';

/**
 * Bucket F: Stripe Connect payout attribution removed — stripe_accounts table dropped.
 * Payout events are no-ops until a replacement payout-ledger strategy is defined.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function handlePayoutEvent(
  _supabase: SupabaseClient<Database>,
  _event: Stripe.Event
): Promise<void> {
  // No-op: stripe_accounts table dropped in migration 00058.
}

export interface PayoutHistoryRow {
  id: string;
  stripe_payout_id: string;
  amount_cents: number;
  status: string;
  arrival_date: string | null;
  failure_message: string | null;
  bookings_count: number;
}

export async function getPayoutHistory(
  supabase: SupabaseClient<Database>,
  vendorProfileId: string,
  params: { cursor?: string; limit?: number } = {}
): Promise<{ data: PayoutHistoryRow[] | null; error: unknown; nextCursor?: string }> {
  const { cursor, limit = 25 } = params;
  let query = supabase
    .from('payouts')
    .select(
      'id, stripe_payout_id, amount_cents, status, arrival_date, failure_message, payout_bookings(count)'
    )
    .eq('vendor_profile_id', vendorProfileId)
    .order('arrival_date', { ascending: false, nullsFirst: false })
    .limit(limit + 1);
  if (cursor) query = query.lt('arrival_date', cursor);

  const { data, error } = await query;
  if (error) return { data: null, error };

  const rows: PayoutHistoryRow[] = (data ?? []).map((r) => ({
    id: r.id as string,
    stripe_payout_id: r.stripe_payout_id as string,
    amount_cents: r.amount_cents as number,
    status: r.status as string,
    arrival_date: (r.arrival_date as string | null) ?? null,
    failure_message: (r.failure_message as string | null) ?? null,
    bookings_count: ((r.payout_bookings as { count: number }[] | null) ?? []).reduce(
      (s, c) => s + (c.count ?? 0),
      0
    ),
  }));

  const hasMore = rows.length > limit;
  const trimmed = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? (trimmed[trimmed.length - 1].arrival_date ?? undefined) : undefined;
  return { data: trimmed, error: null, nextCursor };
}

// ─── Vendor Attribution (Baazar attribution dashboard) ───────────────────────
// Extracted to payment.attribution.ts (client-safe). Re-exported here so that
// server-side callers (money/page.tsx, unit tests) can still import from this module.

export type { AttributionRange, Attribution } from '@/services/payment.attribution';
export { getVendorAttribution } from '@/services/payment.attribution';

export interface CashToCollectRow {
  bookingEventId: string;
  bookingId: string;
  eventDate: string;
  coupleName: string;
  packageLabel: string;
  amountCents: number;
}

export async function getCashToCollect(
  supabase: SupabaseClient<Database>,
  vendorProfileId: string,
  daysAhead = 30
): Promise<{ data: CashToCollectRow[] | null; error: unknown }> {
  const today = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('booking_events')
    .select(
      'id, booking_id, event_date, event_type_label, bookings!inner(status, vendor_profile_id, couple_full_name, package_name_snapshot, total_price_cents)'
    )
    .eq('bookings.vendor_profile_id', vendorProfileId)
    .eq('bookings.status', 'deposit_paid')
    .gte('event_date', today)
    .lte('event_date', end)
    .order('event_date');

  if (error) return { data: null, error };

  const rows = (data ?? []).map((r) => {
    const b = r.bookings as unknown as {
      couple_full_name: string | null;
      package_name_snapshot: string | null;
      total_price_cents: number;
    };
    return {
      bookingEventId: r.id as string,
      bookingId: r.booking_id as string,
      eventDate: r.event_date as string,
      coupleName: b.couple_full_name ?? 'Couple',
      packageLabel: b.package_name_snapshot ?? 'Booking',
      amountCents: Math.round(b.total_price_cents * (1 - DEPOSIT_RATE)),
    };
  });

  return { data: rows, error: null };
}
