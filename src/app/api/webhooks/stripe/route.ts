import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe/client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  handlePaymentSuccess,
  handlePaymentFailure,
  handleAccountUpdated,
  handleChargeRefunded,
} from '@/services/payment.service';
import { withErrorBoundary } from '@/lib/api/error-boundary';

export const POST = withErrorBoundary(async (request: NextRequest) => {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const pi = event.data.object as Stripe.PaymentIntent;
      const bookingId = pi.metadata?.booking_id;
      if (bookingId) await handlePaymentSuccess(supabase, pi.id, bookingId, pi.amount);
      break;
    }

    case 'payment_intent.payment_failed': {
      const pi = event.data.object as Stripe.PaymentIntent;
      const bookingId = pi.metadata?.booking_id;
      if (bookingId) await handlePaymentFailure(supabase, pi.id, bookingId);
      break;
    }

    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
      if (piId) await handleChargeRefunded(supabase, piId, charge.amount_refunded, charge.amount);
      break;
    }

    case 'account.updated': {
      const account = event.data.object as Stripe.Account;
      await handleAccountUpdated(
        supabase,
        account.id,
        account.charges_enabled ?? false,
        account.payouts_enabled ?? false,
        account.details_submitted ?? false
      );
      break;
    }

    case 'payout.paid':
    case 'payout.failed': {
      console.log(`[Stripe Webhook] ${event.type}`, event.data.object);
      break;
    }

    default:
      console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true }, { status: 200 });
});
