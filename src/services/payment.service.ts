import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { CancellerRole, ServiceResult } from '@/types';
import { getBookingDateRange } from '@/services/booking.service';
import { stripe } from '@/lib/stripe/client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { createMinimalAccount, createFullOnboardingLink } from '@/lib/stripe/connect';
import {
  getDepositRate,
  calculatePlatformCut,
  calculateVendorPending,
  type PaymentMode,
} from '@/lib/utils';
import {
  sendDepositConfirmationEmail,
  sendCompletionEmailToVendor,
  sendReviewRequestEmail,
  sendCancellationEmail,
} from '@/lib/email/resend';
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

// ─── Minimal Stripe Account (deferred onboarding) ─────────────────────────────
// Called lazily — typically when vendor submits their first quote. Idempotent.

export async function setupMinimalStripeAccount(
  supabase: SupabaseClient<Database>,
  vendorProfileId: string,
  vendorEmail: string,
  country: string = 'US'
): Promise<ServiceResult<{ stripeAccountId: string }>> {
  const { data: existing } = await supabase
    .from('stripe_accounts')
    .select('stripe_account_id')
    .eq('vendor_profile_id', vendorProfileId)
    .single();

  if (existing) {
    return { data: { stripeAccountId: existing.stripe_account_id }, status: 200 };
  }

  const { accountId } = await createMinimalAccount(vendorProfileId, vendorEmail, country);

  const { error } = await supabase.from('stripe_accounts').insert({
    vendor_profile_id: vendorProfileId,
    stripe_account_id: accountId,
    minimal_created_at: new Date().toISOString(),
  });

  if (error) return { error: 'Failed to save Stripe account', status: 500 };
  return { data: { stripeAccountId: accountId }, status: 200 };
}

// ─── Deposit Checkout ─────────────────────────────────────────────────────────
// Plain platform charge (no destination, no app fee, immediate capture). Internal
// 30/70 ledger split is recorded in metadata for webhook to pick up.

export async function createDepositCheckout(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  coupleUserId: string
): Promise<ServiceResult<{ checkoutUrl: string }>> {
  // RLS on stripe_accounts only allows the vendor to read their own row, so the
  // couple can't fetch it through the user-scoped client. Read the booking +
  // vendor_profile under RLS (enforces couple ownership), then read the
  // vendor's stripe_account through a service-role client.
  const { data: booking } = await supabase
    .from('bookings')
    .select('*, vendor_profiles!inner(id, business_name, payment_mode)')
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
    payment_mode: string | null;
  };

  const admin = createServiceRoleClient();
  const { data: stripeAccount } = await admin
    .from('stripe_accounts')
    .select('stripe_account_id, frozen_reason')
    .eq('vendor_profile_id', vp.id)
    .maybeSingle();

  if (!stripeAccount) {
    return {
      error: "Vendor hasn't set up payments yet. They'll be notified.",
      status: 400,
    };
  }
  if (stripeAccount.frozen_reason) {
    return { error: 'This vendor is temporarily unable to accept new bookings.', status: 400 };
  }

  // Deposit rate and split both depend on vendor's payment mode.
  // Cash vendors: 5% deposit, 100% to platform, 0% to vendor.
  // Stripe vendors: 10% deposit, 30% to platform, 70% to vendor.
  const paymentMode = (vp.payment_mode ?? 'stripe') as PaymentMode;
  const depositAmount = Math.floor(booking.total_price_cents * getDepositRate(paymentMode));
  const platformCut = calculatePlatformCut(depositAmount, paymentMode);
  const vendorPending = calculateVendorPending(depositAmount, paymentMode);

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

export async function handleAccountUpdated(
  supabase: SupabaseClient<Database>,
  stripeAccountId: string,
  chargesEnabled: boolean,
  payoutsEnabled: boolean,
  detailsSubmitted: boolean
): Promise<void> {
  // First-time details_submitted → record timestamp for onboarding-pending UI.
  const { data: existing } = await supabase
    .from('stripe_accounts')
    .select('details_submitted_at')
    .eq('stripe_account_id', stripeAccountId)
    .maybeSingle();

  const updatePayload: Record<string, unknown> = {
    onboarding_complete: detailsSubmitted,
    charges_enabled: chargesEnabled,
    payouts_enabled: payoutsEnabled,
  };

  if (detailsSubmitted && !existing?.details_submitted_at) {
    updatePayload.details_submitted_at = new Date().toISOString();
  }

  await supabase
    .from('stripe_accounts')
    .update(updatePayload)
    .eq('stripe_account_id', stripeAccountId);

  // If vendor just became fully onboarded, auto-transfer any earned funds.
  if (chargesEnabled && payoutsEnabled) {
    await autoTransferEarnedFunds(supabase, stripeAccountId);
  }
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
// Single source of truth for the locked cancellation table. Takes who + when,
// returns what fraction of each party's share survives.

interface RefundPolicy {
  coupleRefundPct: number; // 0..1 of total deposit
  vendorKeepPct: number; // 0..1 of vendor's 70% portion
  platformKeepPct: number; // 0..1 of platform's 30% portion
  clawVendorOtherPending: boolean; // true for vendor-fault events
}

export function computeRefundPolicy(
  cancellerRole: CancellerRole,
  bookingStatus: string,
  firstEventDate: string | null,
  depositPaidAt: string | null,
  fault: 'none' | 'vendor_fault' | 'force_majeure' = 'none',
  now: Date = new Date(),
  paymentMode: PaymentMode = 'stripe'
): RefundPolicy {
  if (bookingStatus !== 'deposit_paid') {
    return {
      coupleRefundPct: 0,
      vendorKeepPct: 0,
      platformKeepPct: 0,
      clawVendorOtherPending: false,
    };
  }

  if (cancellerRole === 'vendor') {
    // vendor_fault: 100% refund + claw + strike counted by caller.
    // force_majeure: 100% refund but no claw, no strike.
    // none: 100% refund, no claw, no strike (scheduling conflict >14d out, etc.).
    const policy: RefundPolicy = {
      coupleRefundPct: 1.0,
      vendorKeepPct: 0,
      platformKeepPct: 0,
      clawVendorOtherPending: fault === 'vendor_fault',
    };
    if (paymentMode === 'cash') {
      return {
        ...policy,
        vendorKeepPct: 0,
        platformKeepPct: 1 - policy.coupleRefundPct,
        clawVendorOtherPending: false,
      };
    }
    return policy;
  }

  if (cancellerRole === 'couple') {
    const hoursSinceDeposit = depositPaidAt
      ? (now.getTime() - new Date(depositPaidAt).getTime()) / 36e5
      : Infinity;
    // If no events exist yet (edge case), default to most-conservative tier (no refund)
    const daysToEvent = firstEventDate
      ? (new Date(firstEventDate).getTime() - now.getTime()) / (36e5 * 24)
      : -1;

    let policy: RefundPolicy;

    if (hoursSinceDeposit < 24) {
      policy = {
        coupleRefundPct: 1.0,
        vendorKeepPct: 0,
        platformKeepPct: 0,
        clawVendorOtherPending: false,
      };
    } else if (daysToEvent > 30) {
      policy = {
        coupleRefundPct: 0.5,
        vendorKeepPct: 0.5,
        platformKeepPct: 1.0,
        clawVendorOtherPending: false,
      };
    } else {
      policy = {
        coupleRefundPct: 0,
        vendorKeepPct: 1.0,
        platformKeepPct: 1.0,
        clawVendorOtherPending: false,
      };
    }

    if (paymentMode === 'cash') {
      return {
        ...policy,
        vendorKeepPct: 0,
        platformKeepPct: 1 - policy.coupleRefundPct,
        clawVendorOtherPending: false,
      };
    }
    return policy;
  }

  // Mutual: default to 50/50. Admin can adjust manually.
  const mutualPolicy: RefundPolicy = {
    coupleRefundPct: 0.5,
    vendorKeepPct: 0.5,
    platformKeepPct: 1.0,
    clawVendorOtherPending: false,
  };
  if (paymentMode === 'cash') {
    return {
      ...mutualPolicy,
      vendorKeepPct: 0,
      platformKeepPct: 1 - mutualPolicy.coupleRefundPct,
      clawVendorOtherPending: false,
    };
  }
  return mutualPolicy;
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
    .select('*, vendor_profiles!inner(id, user_id, payment_mode), transactions(*)')
    .eq('id', bookingId)
    .single();

  if (!booking) return { error: 'Booking not found', status: 404 };

  const vp = booking.vendor_profiles as unknown as {
    id: string;
    user_id: string;
    payment_mode: string | null;
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

  // Derive first event date from booking_events for refund tier calculation.
  const { firstEventDate } = await getBookingDateRange(supabase, bookingId);

  const bookingPaymentMode = (vp.payment_mode ?? 'stripe') as PaymentMode;

  const policy = computeRefundPolicy(
    cancellerRole,
    booking.status,
    firstEventDate,
    booking.deposit_paid_at,
    effectiveFault,
    new Date(),
    bookingPaymentMode
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

    if (cancellerRole === 'vendor' && effectiveFault === 'vendor_fault') {
      await recordVendorNoShowOrCancel(supabase, vp.id);
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

/**
 * Record a vendor no-show/cancellation strike. Freezes the account on 2nd strike
 * in the same calendar year. Annual reset is handled by the daily cron.
 */
export async function recordVendorNoShowOrCancel(
  supabase: SupabaseClient<Database>,
  vendorProfileId: string
): Promise<void> {
  const currentYear = new Date().getUTCFullYear();
  const { data: account } = await supabase
    .from('stripe_accounts')
    .select('no_show_count_year, no_show_year')
    .eq('vendor_profile_id', vendorProfileId)
    .single();

  if (!account) return;

  const count = account.no_show_year === currentYear ? (account.no_show_count_year ?? 0) + 1 : 1;

  const updates: Database['public']['Tables']['stripe_accounts']['Update'] = {
    no_show_count_year: count,
    no_show_year: currentYear,
  };

  if (count >= 2) {
    updates.frozen_reason = 'no_show_strikes';
    updates.frozen_at = new Date().toISOString();
  }

  await supabase.from('stripe_accounts').update(updates).eq('vendor_profile_id', vendorProfileId);
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
      'id, couple_user_id, booking_events(id, event_end_time, event_type_label, sequence, completed_at), vendor_profiles!inner(user_id)'
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
    const bvp = b.vendor_profiles as unknown as { user_id: string };
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

    // Notify both parties for each newly completed event.
    for (const ev of dueNow) {
      const evPayload = {
        bookingId: b.id,
        eventTypeLabel: ev.event_type_label,
        sequence: ev.sequence,
        eventsCount: events.length,
      };
      if (b.couple_user_id) {
        await deliver('notify', () => notifyEventCompleted(supabase, b.couple_user_id, evPayload), {
          booking_id: b.id,
        });
      }
      if (bvp.user_id) {
        await deliver('notify', () => notifyEventCompleted(supabase, bvp.user_id, evPayload), {
          booking_id: b.id,
        });
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
    .select(
      'id, stripe_accounts(stripe_account_id, charges_enabled, payouts_enabled, frozen_reason, details_submitted_at)'
    )
    .eq('user_id', vendorUserId)
    .single();

  if (!vp) return { error: 'Vendor profile not found', status: 404 };

  const stripeAccount = (
    vp.stripe_accounts as
      | {
          stripe_account_id: string;
          charges_enabled: boolean;
          payouts_enabled: boolean;
          frozen_reason: string | null;
          details_submitted_at: string | null;
        }[]
      | null
  )?.[0];

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

  const fullyOnboarded = stripeAccount?.charges_enabled && stripeAccount?.payouts_enabled;
  const verificationPending = !fullyOnboarded && !!stripeAccount?.details_submitted_at;
  const requiresOnboarding = !fullyOnboarded && !verificationPending;

  return {
    data: {
      pending_escrow_cents: pendingEscrow,
      available_cents: available,
      transferred_cents: transferred,
      requires_onboarding: requiresOnboarding,
      verification_pending: verificationPending,
      stripe_account_id: stripeAccount?.stripe_account_id ?? null,
      frozen_reason: stripeAccount?.frozen_reason ?? null,
    },
    status: 200,
  };
}

export async function initiatePayout(
  supabase: SupabaseClient<Database>,
  vendorUserId: string
): Promise<ServiceResult<{ transferred_cents: number; onboarding_url?: string }>> {
  const earnings = await getVendorEarnings(supabase, vendorUserId);
  if (earnings.error || !earnings.data) {
    return { error: earnings.error ?? 'unknown', status: earnings.status };
  }

  if (earnings.data.frozen_reason) {
    return { error: 'Your account is temporarily frozen. Contact support.', status: 403 };
  }

  if (earnings.data.available_cents === 0) {
    return { error: 'No earned funds available to withdraw', status: 400 };
  }

  if (!earnings.data.stripe_account_id) {
    return { error: 'Stripe account not initialized', status: 400 };
  }

  if (earnings.data.requires_onboarding) {
    const url = await createFullOnboardingLink(earnings.data.stripe_account_id);
    return { data: { transferred_cents: 0, onboarding_url: url }, status: 200 };
  }

  const { data: vp } = await supabase
    .from('vendor_profiles')
    .select('id')
    .eq('user_id', vendorUserId)
    .single();

  if (!vp) return { error: 'Vendor profile not found', status: 404 };

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id')
    .eq('vendor_profile_id', vp.id);
  const bookingIds = (bookings ?? []).map((b) => b.id);

  if (bookingIds.length === 0) {
    return { error: 'No earned funds available to withdraw', status: 400 };
  }

  const { data: earnedTxs } = await supabase
    .from('transactions')
    .select('id, stripe_payment_intent_id, vendor_payout')
    .eq('status', 'earned')
    .is('transferred_at', null)
    .in('booking_request_id', bookingIds);

  let totalTransferred = 0;

  for (const tx of earnedTxs ?? []) {
    try {
      const pi = await stripe.paymentIntents.retrieve(tx.stripe_payment_intent_id);
      const chargeId =
        typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id;

      if (!chargeId) {
        logger.warn('no charge on PI, skipping transfer', {
          site: 'initiatePayout',
          paymentIntentId: tx.stripe_payment_intent_id,
          txId: tx.id,
        });
        continue;
      }

      const transfer = await stripe.transfers.create(
        {
          amount: tx.vendor_payout,
          currency: 'usd',
          destination: earnings.data.stripe_account_id,
          source_transaction: chargeId,
          metadata: { vendor_user_id: vendorUserId, transaction_id: tx.id },
        },
        { idempotencyKey: `tx:${tx.id}:transfer` }
      );

      await supabase
        .from('transactions')
        .update({
          transferred_at: new Date().toISOString(),
          stripe_transfer_id: transfer.id,
        })
        .eq('id', tx.id);

      totalTransferred += tx.vendor_payout;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transfer failed';
      logger.error('transfer failed', err, { site: 'initiatePayout', txId: tx.id });
      if (totalTransferred > 0) {
        return { data: { transferred_cents: totalTransferred }, status: 200 };
      }
      return { error: `Transfer failed: ${message}`, status: 502 };
    }
  }

  if (totalTransferred === 0) {
    return { error: 'No transferable funds found', status: 400 };
  }

  return { data: { transferred_cents: totalTransferred }, status: 200 };
}

/**
 * Called from handleAccountUpdated when a vendor's onboarding completes. Finds
 * the vendor(s) by stripe_account_id and triggers payout of any earned funds
 * in one shot for each owning user.
 *
 * Sub-project I §5: the FK direction is now vendor_profiles.stripe_account_id.
 * Multiple vendor_profiles can share one stripe_account under the hybrid model.
 * We trigger a payout for each distinct owning user (in practice, all linked
 * vendor_profiles belong to the same user — the hybrid model is one-user-many-
 * businesses, not many-users-one-stripe — but the loop is defensive).
 */
async function autoTransferEarnedFunds(
  supabase: SupabaseClient<Database>,
  stripeAccountId: string
): Promise<void> {
  // Look up the stripe_account by its Stripe ID, then find all vendor_profiles
  // pointing at it (new FK direction).
  const { data: account } = await supabase
    .from('stripe_accounts')
    .select('id')
    .eq('stripe_account_id', stripeAccountId)
    .maybeSingle();
  if (!account) return;

  const { data: linkedProfiles } = await supabase
    .from('vendor_profiles')
    .select('user_id')
    .eq('stripe_account_id', account.id);

  const seenUserIds = new Set<string>();
  for (const vp of linkedProfiles ?? []) {
    if (seenUserIds.has(vp.user_id)) continue;
    seenUserIds.add(vp.user_id);
    const result = await initiatePayout(supabase, vp.user_id);
    if (result.error) {
      logger.warn('auto transfer skipped', {
        site: 'autoTransferEarnedFunds',
        stripeAccountId,
        userId: vp.user_id,
        reason: result.error,
      });
    }
  }
}

// ─── Sub-project E: Payouts ledger ──────────────────────────────────

import type Stripe from 'stripe';
import { CASH_DEPOSIT_RATE } from '@/lib/utils';

const PAYOUT_STATUS_MAP: Record<string, 'pending' | 'in_transit' | 'paid' | 'failed' | 'canceled'> =
  {
    'payout.created': 'pending',
    'payout.paid': 'paid',
    'payout.failed': 'failed',
    'payout.canceled': 'canceled',
  };

/**
 * Persist a Stripe payout event into the payouts ledger and (on payout.paid)
 * derive contributing bookings from transactions transferred during the payout
 * window. Idempotent via UNIQUE(stripe_payout_id).
 */
export async function handlePayoutEvent(
  supabase: SupabaseClient<Database>,
  event: Stripe.Event
): Promise<void> {
  const status = PAYOUT_STATUS_MAP[event.type];
  if (!status) return;

  const payout = event.data.object as Stripe.Payout;
  const stripeAccount = event.account;
  if (!stripeAccount) {
    console.warn('[payouts] event without account field, skipping', event.id);
    return;
  }

  // Sub-project I §5: look up stripe_account by Stripe ID, then find linked
  // vendor_profile(s) via the reversed FK direction. Under the hybrid model,
  // one stripe_account may serve multiple vendor_profiles for the same user;
  // pick the oldest (created_at ASC, by id ordering since vendor_profiles.id is
  // not date-ordered we use the order index) as the canonical attribution for
  // the payouts ledger. The full payout_bookings join attributes individual
  // bookings regardless of which vendor_profile owns the stripe_account.
  const { data: acc } = await supabase
    .from('stripe_accounts')
    .select('id')
    .eq('stripe_account_id', stripeAccount)
    .maybeSingle();
  if (!acc) {
    console.warn('[payouts] no stripe_account row for', stripeAccount);
    return;
  }

  // Find vendor_profile(s) linked to this stripe_account; use the oldest
  // (created_at ASC) as the canonical "primary" attribution.
  const { data: linkedProfiles } = await supabase
    .from('vendor_profiles')
    .select('id, created_at')
    .eq('stripe_account_id', acc.id)
    .order('created_at', { ascending: true });

  const primaryVendorProfileId = linkedProfiles?.[0]?.id ?? null;
  if (!primaryVendorProfileId) {
    console.warn('[payouts] no vendor_profile linked to stripe_account', acc.id);
    return;
  }

  const linkedProfileIds = (linkedProfiles ?? []).map((p) => p.id);

  const arrivalDate = payout.arrival_date
    ? new Date(payout.arrival_date * 1000).toISOString().slice(0, 10)
    : null;

  await supabase.from('payouts').upsert(
    {
      vendor_profile_id: primaryVendorProfileId,
      stripe_payout_id: payout.id,
      amount_cents: payout.amount,
      currency: payout.currency,
      status,
      arrival_date: arrivalDate,
      failure_message: payout.failure_message ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'stripe_payout_id' }
  );

  // On payout.paid, attribute the payout to the bookings whose transferred_at
  // falls inside the payout window (created → arrival_date). Bookings can
  // belong to ANY of the vendor_profiles linked to this stripe_account.
  if (event.type === 'payout.paid' && payout.arrival_date) {
    const createdAt = new Date(payout.created * 1000).toISOString();
    const arrivalISO = new Date(payout.arrival_date * 1000).toISOString();

    const { data: txs } = await supabase
      .from('transactions')
      .select('booking_request_id, bookings!inner(vendor_profile_id)')
      .in('bookings.vendor_profile_id', linkedProfileIds)
      .gte('transferred_at', createdAt)
      .lte('transferred_at', arrivalISO);

    if (txs && txs.length > 0) {
      const { data: po } = await supabase
        .from('payouts')
        .select('id')
        .eq('stripe_payout_id', payout.id)
        .single();
      if (po) {
        await supabase.from('payout_bookings').upsert(
          txs.map((t) => ({
            payout_id: po.id,
            booking_id: t.booking_request_id as string,
          })),
          { onConflict: 'payout_id,booking_id', ignoreDuplicates: true }
        );
      }
    }
  }
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
      amountCents: Math.round(b.total_price_cents * (1 - CASH_DEPOSIT_RATE)),
    };
  });

  return { data: rows, error: null };
}
