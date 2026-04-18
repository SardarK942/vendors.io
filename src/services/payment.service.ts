import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { CancellerRole, ServiceResult } from '@/types';
import { stripe } from '@/lib/stripe/client';
import { createMinimalAccount, createFullOnboardingLink } from '@/lib/stripe/connect';
import { calculateDepositAmount, calculatePlatformCut, calculateVendorPending } from '@/lib/utils';
import {
  sendDepositConfirmationEmail,
  sendCompletionEmailToVendor,
  sendReviewRequestEmail,
  sendCancellationEmail,
} from '@/lib/email/resend';
import { logger } from '@/lib/logger';

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
  const { data: booking } = await supabase
    .from('booking_requests')
    .select(
      '*, vendor_profiles!inner(id, business_name, stripe_accounts(stripe_account_id, frozen_reason))'
    )
    .eq('id', bookingId)
    .eq('couple_user_id', coupleUserId)
    .single();

  if (!booking) return { error: 'Booking not found', status: 404 };
  if (booking.status !== 'quoted') {
    return { error: 'Booking must be in "quoted" state to pay deposit', status: 400 };
  }
  if (!booking.vendor_quote_amount) return { error: 'No quote amount set', status: 400 };

  const vp = booking.vendor_profiles as unknown as {
    id: string;
    business_name: string;
    stripe_accounts: { stripe_account_id: string; frozen_reason: string | null }[] | null;
  };

  const stripeAccount = vp.stripe_accounts?.[0];
  if (!stripeAccount) {
    return {
      error: "Vendor hasn't set up payments yet. They'll be notified.",
      status: 400,
    };
  }
  if (stripeAccount.frozen_reason) {
    return { error: 'This vendor is temporarily unable to accept new bookings.', status: 400 };
  }

  const depositAmount = calculateDepositAmount(booking.vendor_quote_amount);
  const platformCut = calculatePlatformCut(depositAmount);
  const vendorPending = calculateVendorPending(depositAmount);

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Booking Deposit — ${vp.business_name}`,
              description: `Deposit for ${booking.event_type} on ${booking.event_date}`,
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
    .from('booking_requests')
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
    .from('booking_requests')
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
      await sendDepositConfirmationEmail(coupleEmail, vp.business_name, amount, false);
    }
    if (vendorUser?.email) {
      await sendDepositConfirmationEmail(vendorUser.email, vp.business_name, amount, true);
    }
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

function computeRefundPolicy(
  cancellerRole: CancellerRole,
  bookingStatus: string,
  eventDate: string,
  depositPaidAt: string | null,
  fault: 'none' | 'vendor_fault' | 'force_majeure' = 'none',
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

  if (cancellerRole === 'vendor') {
    // vendor_fault: 100% refund + claw + strike counted by caller.
    // force_majeure: 100% refund but no claw, no strike.
    // none: 100% refund, no claw, no strike (scheduling conflict >14d out, etc.).
    return {
      coupleRefundPct: 1.0,
      vendorKeepPct: 0,
      platformKeepPct: 0,
      clawVendorOtherPending: fault === 'vendor_fault',
    };
  }

  if (cancellerRole === 'couple') {
    const hoursSinceDeposit = depositPaidAt
      ? (now.getTime() - new Date(depositPaidAt).getTime()) / 36e5
      : Infinity;
    const daysToEvent = (new Date(eventDate).getTime() - now.getTime()) / (36e5 * 24);

    if (hoursSinceDeposit < 24) {
      return {
        coupleRefundPct: 1.0,
        vendorKeepPct: 0,
        platformKeepPct: 0,
        clawVendorOtherPending: false,
      };
    }
    if (daysToEvent > 30) {
      return {
        coupleRefundPct: 0.5,
        vendorKeepPct: 0.5,
        platformKeepPct: 1.0,
        clawVendorOtherPending: false,
      };
    }
    return {
      coupleRefundPct: 0,
      vendorKeepPct: 1.0,
      platformKeepPct: 1.0,
      clawVendorOtherPending: false,
    };
  }

  // Mutual: default to 50/50. Admin can adjust manually.
  return {
    coupleRefundPct: 0.5,
    vendorKeepPct: 0.5,
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
    .from('booking_requests')
    .select('*, vendor_profiles!inner(id, user_id), transactions(*)')
    .eq('id', bookingId)
    .single();

  if (!booking) return { error: 'Booking not found', status: 404 };

  const vp = booking.vendor_profiles as unknown as { id: string; user_id: string };
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
    .from('booking_requests')
    .update({
      status: newStatus,
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason,
      cancellation_fault: effectiveFault,
    })
    .eq('id', bookingId)
    .in('status', ['pending', 'quoted', 'deposit_paid'])
    .select('id');

  if (!lockRows || lockRows.length === 0) {
    return {
      error: 'Booking is no longer cancellable (already cancelled or completed)',
      status: 409,
    };
  }

  // Pre-deposit: no money to move.
  if (booking.status === 'pending' || booking.status === 'quoted') {
    return { data: { refund_amount_cents: 0, new_status: newStatus }, status: 200 };
  }

  const policy = computeRefundPolicy(
    cancellerRole,
    booking.status,
    booking.event_date,
    booking.deposit_paid_at,
    effectiveFault
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
    .from('booking_requests')
    .select(
      'couple_email, users!couple_user_id(email), vendor_profiles!inner(business_name, users!user_id(email))'
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
}

// ─── Vendor Claw + Freeze ─────────────────────────────────────────────────────

export async function clawVendorPending(
  supabase: SupabaseClient<Database>,
  vendorProfileId: string,
  amountCents: number
): Promise<void> {
  const { data: bookings } = await supabase
    .from('booking_requests')
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
    .from('booking_requests')
    .select('couple_user_id, status, event_date')
    .eq('id', bookingId)
    .single();

  if (!booking) return { error: 'Booking not found', status: 404 };
  if (booking.couple_user_id !== coupleUserId) return { error: 'Forbidden', status: 403 };
  if (booking.status !== 'deposit_paid') {
    return { error: `Cannot complete booking in "${booking.status}" state`, status: 400 };
  }

  const today = new Date().toISOString().slice(0, 10);
  if (booking.event_date > today) {
    return { error: 'Cannot complete a booking before the event date', status: 400 };
  }

  // Trigger on_booking_completed handles transaction updates (authorized/recognized → earned).
  await supabase
    .from('booking_requests')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
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
    .from('booking_requests')
    .select('couple_user_id, status, event_date')
    .eq('id', bookingId)
    .single();

  if (!booking) return { error: 'Booking not found', status: 404 };
  if (booking.couple_user_id !== coupleUserId) return { error: 'Forbidden', status: 403 };
  if (booking.status !== 'deposit_paid') {
    return { error: `Cannot dispute booking in "${booking.status}" state`, status: 400 };
  }

  const today = new Date().toISOString().slice(0, 10);
  if (booking.event_date > today) {
    return { error: 'Cannot dispute a booking before the event date', status: 400 };
  }

  const { data: lockRows } = await supabase
    .from('booking_requests')
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
    .from('booking_requests')
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
    await sendCompletionEmailToVendor(vendorUser.email, vp.business_name, vendorPayout);
  }
  if (coupleEmail) {
    await sendReviewRequestEmail(coupleEmail, vp.business_name, bookingId);
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

// ─── Cron: auto-complete past-event bookings (48h after event_date) ──────────

export async function autoCompleteBookings(
  supabase: SupabaseClient<Database>
): Promise<{ completed: number }> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const { data } = await supabase
    .from('booking_requests')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('status', 'deposit_paid')
    .lt('event_date', cutoffDate)
    .select('id');

  return { completed: data?.length ?? 0 };
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
    .from('booking_requests')
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
    .from('booking_requests')
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
 * Called from handleAccountUpdated when a vendor's onboarding completes. Finds the
 * vendor by stripe_account_id and triggers payout of any earned funds in one shot.
 */
async function autoTransferEarnedFunds(
  supabase: SupabaseClient<Database>,
  stripeAccountId: string
): Promise<void> {
  const { data: account } = await supabase
    .from('stripe_accounts')
    .select('vendor_profile_id, vendor_profiles!inner(user_id)')
    .eq('stripe_account_id', stripeAccountId)
    .single();

  if (!account) return;
  const vp = account.vendor_profiles as unknown as { user_id: string };
  const result = await initiatePayout(supabase, vp.user_id);
  if (result.error) {
    logger.warn('auto transfer skipped', {
      site: 'autoTransferEarnedFunds',
      stripeAccountId,
      reason: result.error,
    });
  }
}
