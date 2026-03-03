import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { ServiceResult } from '@/types';
import { stripe } from '@/lib/stripe/client';
import { createConnectAccount } from '@/lib/stripe/connect';
import { calculateDepositAmount, calculatePlatformFee } from '@/lib/utils';

// ─── Connect Account Management ────────────────────────────────

export async function setupStripeConnect(
  supabase: SupabaseClient<Database>,
  vendorProfileId: string,
  vendorEmail: string
): Promise<ServiceResult<{ onboardingUrl: string }>> {
  // Check if already has a Stripe account
  const { data: existing } = await supabase
    .from('stripe_accounts')
    .select('*')
    .eq('vendor_profile_id', vendorProfileId)
    .single();

  if (existing?.onboarding_complete) {
    return { error: 'Stripe account already set up', status: 409 };
  }

  if (existing) {
    // Resume onboarding
    const { createAccountLink } = await import('@/lib/stripe/connect');
    const url = await createAccountLink(existing.stripe_account_id);
    return { data: { onboardingUrl: url }, status: 200 };
  }

  // Create new Connect account
  const { accountId, onboardingUrl } = await createConnectAccount(vendorProfileId, vendorEmail);

  const { error } = await supabase.from('stripe_accounts').insert({
    vendor_profile_id: vendorProfileId,
    stripe_account_id: accountId,
  });

  if (error) {
    return { error: 'Failed to save Stripe account', status: 500 };
  }

  return { data: { onboardingUrl }, status: 200 };
}

// ─── Deposit Payments ───────────────────────────────────────────

export async function createDepositCheckout(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  coupleUserId: string
): Promise<ServiceResult<{ checkoutUrl: string }>> {
  // Get booking with vendor's Stripe account
  const { data: booking } = await supabase
    .from('booking_requests')
    .select(
      '*, vendor_profiles!inner(id, business_name, stripe_accounts(stripe_account_id, charges_enabled))'
    )
    .eq('id', bookingId)
    .eq('couple_user_id', coupleUserId)
    .single();

  if (!booking) {
    return { error: 'Booking not found', status: 404 };
  }

  if (booking.status !== 'quoted') {
    return { error: 'Booking must be in "quoted" state to pay deposit', status: 400 };
  }

  if (!booking.vendor_quote_amount) {
    return { error: 'No quote amount set', status: 400 };
  }

  const vendorProfile = booking.vendor_profiles as unknown as {
    id: string;
    business_name: string;
    stripe_accounts: { stripe_account_id: string; charges_enabled: boolean }[] | null;
  };

  const stripeAccount = vendorProfile.stripe_accounts?.[0];

  if (!stripeAccount?.charges_enabled) {
    return { error: 'Vendor has not completed Stripe onboarding', status: 400 };
  }

  const depositAmount = calculateDepositAmount(booking.vendor_quote_amount);
  const platformFee = calculatePlatformFee(depositAmount);

  // Create Stripe Checkout Session with destination charge
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Hold Deposit — ${vendorProfile.business_name}`,
            description: `Booking deposit for ${booking.event_type} on ${booking.event_date}`,
          },
          unit_amount: depositAmount,
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      capture_method: 'manual', // Authorize, don't capture yet
      application_fee_amount: platformFee,
      transfer_data: {
        destination: stripeAccount.stripe_account_id,
      },
      metadata: {
        booking_id: bookingId,
        vendor_profile_id: vendorProfile.id,
      },
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/bookings/${bookingId}?payment=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/bookings/${bookingId}?payment=cancelled`,
    metadata: {
      booking_id: bookingId,
    },
  });

  return { data: { checkoutUrl: session.url! }, status: 200 };
}

// ─── Webhook Handlers ───────────────────────────────────────────

export async function handlePaymentSuccess(
  supabase: SupabaseClient<Database>,
  paymentIntentId: string,
  bookingId: string,
  amount: number
): Promise<void> {
  const platformFee = calculatePlatformFee(amount);

  // Update booking status to deposit_paid + reveal contact
  await supabase
    .from('booking_requests')
    .update({
      status: 'deposit_paid',
      deposit_amount: amount,
      deposit_paid_at: new Date().toISOString(),
      stripe_payment_intent_id: paymentIntentId,
      couple_contact_revealed: true, // CRITICAL: anti-backdooring
    })
    .eq('id', bookingId);

  // Record transaction
  await supabase.from('transactions').insert({
    booking_request_id: bookingId,
    stripe_payment_intent_id: paymentIntentId,
    amount,
    platform_fee: platformFee,
    vendor_payout: amount - platformFee,
    status: 'authorized',
  });
}

export async function handlePaymentFailure(
  supabase: SupabaseClient<Database>,
  paymentIntentId: string,
  bookingId: string
): Promise<void> {
  // Log the failed transaction; booking stays in "quoted" state
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
  await supabase
    .from('stripe_accounts')
    .update({
      onboarding_complete: detailsSubmitted,
      charges_enabled: chargesEnabled,
      payouts_enabled: payoutsEnabled,
    })
    .eq('stripe_account_id', stripeAccountId);
}

export async function refundDeposit(
  supabase: SupabaseClient<Database>,
  bookingId: string
): Promise<void> {
  const { data: booking } = await supabase
    .from('booking_requests')
    .select('stripe_payment_intent_id')
    .eq('id', bookingId)
    .single();

  if (!booking?.stripe_payment_intent_id) return;

  try {
    // Cancel the uncaptured payment intent (full refund)
    await stripe.paymentIntents.cancel(booking.stripe_payment_intent_id);

    // Update transaction status
    await supabase
      .from('transactions')
      .update({ status: 'refunded' })
      .eq('stripe_payment_intent_id', booking.stripe_payment_intent_id);
  } catch (err) {
    console.error('[refundDeposit] Error:', err);
  }
}
