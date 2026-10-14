import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe/client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  handlePaymentSuccess,
  handlePaymentFailure,
  handleChargeRefunded,
  handlePayoutEvent,
} from '@/services/payment.service';
import {
  createOrderFromSession,
  finalizeOrderPaid,
  finalizeOrderCanceled,
  type ShippingAddress,
} from '@/services/orders.service';
import { refreshAccountStatus } from '@/services/connect.service';
import { withErrorBoundary } from '@/lib/api/error-boundary';

/** Service helpers return {error,status} instead of throwing; surface as a handler failure so Stripe retries. */
function throwIfError(result: { error?: string }): void {
  if (result.error) throw new Error(result.error);
}

interface ShippingDetailsLike {
  name?: string | null;
  address?: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
  } | null;
}

function toShippingAddress(d: ShippingDetailsLike | null | undefined): ShippingAddress | null {
  const a = d?.address;
  if (!a) return null;
  return {
    name: d?.name ?? null,
    address: {
      line1: a.line1 ?? null,
      line2: a.line2 ?? null,
      city: a.city ?? null,
      state: a.state ?? null,
      postal_code: a.postal_code ?? null,
      country: a.country ?? null,
    },
  };
}

/**
 * Collected shipping address of a hosted Checkout Session. Newer API versions
 * put it at collected_information.shipping_details; older ones at
 * shipping_details. Falls back to a retrieve when the event omits both but the
 * session charged shipping.
 */
async function resolveShippingAddress(
  session: Stripe.Checkout.Session,
  account: string | undefined
): Promise<ShippingAddress | null> {
  const legacy = (session as unknown as { shipping_details?: ShippingDetailsLike | null })
    .shipping_details;
  const direct = toShippingAddress(session.collected_information?.shipping_details ?? legacy);
  if (direct) return direct;
  if (!session.shipping_cost) return null;
  const full = await stripe.checkout.sessions.retrieve(
    session.id,
    {},
    account ? { stripeAccount: account } : undefined
  );
  const fullLegacy = (full as unknown as { shipping_details?: ShippingDetailsLike | null })
    .shipping_details;
  return toShippingAddress(full.collected_information?.shipping_details ?? fullLegacy);
}

/** Cancel the PI of a voided checkout; an already-canceled PI is success, not a 500 retry loop. */
async function cancelVoidedPaymentIntent(piId: string, account: string | undefined): Promise<void> {
  const opts = account ? { stripeAccount: account } : undefined;
  try {
    await stripe.paymentIntents.cancel(piId, opts);
  } catch (err) {
    let alreadyCanceled = false;
    try {
      const pi = await stripe.paymentIntents.retrieve(piId, {}, opts);
      alreadyCanceled = pi.status === 'canceled';
    } catch {
      alreadyCanceled = false;
    }
    if (!alreadyCanceled) throw err;
  }
}

export const POST = withErrorBoundary(async (request: NextRequest) => {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  // Stripe Connect platforms need two webhook endpoints (each with its own
  // signing secret): one for platform-level events (payment_intent.*, charge.*)
  // and one for connected-account events (account.updated). Try each secret in
  // turn — whichever validates wins.
  const platformSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const connectSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

  let event: Stripe.Event | null = null;
  let lastError: unknown = null;
  for (const secret of [platformSecret, connectSecret]) {
    if (!secret) continue;
    try {
      event = stripe.webhooks.constructEvent(body, signature, secret);
      break;
    } catch (err) {
      lastError = err;
    }
  }

  if (!event) {
    console.error('[Stripe Webhook] Signature verification failed:', lastError);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  // Audit + dedup: insert with unique event_id. If the event was already handled
  // successfully, skip. If it was seen but errored, let the handlers retry.
  const { data: existing } = await supabase
    .from('stripe_events')
    .select('handled_at')
    .eq('event_id', event.id)
    .maybeSingle();

  if (existing?.handled_at) {
    console.log(`[Stripe Webhook] already handled ${event.id}, skipping`);
    return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
  }

  if (!existing) {
    await supabase.from('stripe_events').insert({
      event_id: event.id,
      event_type: event.type,
      payload: event as unknown as Record<string, unknown>,
    });
  }

  let handlerError: string | null = null;

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        if (pi.metadata?.kind === 'shop') {
          throwIfError(await finalizeOrderPaid(supabase, pi.id));
          break;
        }
        const bookingId = pi.metadata?.booking_id;
        // Valid predecessor statuses: 'accepted' (new flow) or 'quoted' (legacy).
        // handlePaymentSuccess transitions to deposit_paid unconditionally.
        if (bookingId) await handlePaymentSuccess(supabase, pi.id, bookingId, pi.amount);
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const bookingId = pi.metadata?.booking_id;
        if (bookingId) await handlePaymentFailure(supabase, pi.id, bookingId);
        break;
      }

      case 'payment_intent.canceled': {
        const pi = event.data.object as Stripe.PaymentIntent;
        if (pi.metadata?.kind === 'shop') {
          throwIfError(await finalizeOrderCanceled(supabase, pi.id));
        }
        break;
      }

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.kind !== 'shop') break;
        const piId =
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : (session.payment_intent?.id ?? null);
        if (!piId) throw new Error('Shop checkout session has no payment_intent');
        const result = await createOrderFromSession(supabase, {
          sessionId: session.id,
          paymentIntentId: piId,
          chargeMode: event.account ? 'direct' : 'escrow',
          account: event.account ?? null,
          taxCents: session.total_details?.amount_tax ?? 0,
          totalCents: session.amount_total ?? 0,
          shippingAddress: await resolveShippingAddress(session, event.account),
        });
        throwIfError(result);
        if (result.data && 'voided' in result.data) {
          await cancelVoidedPaymentIntent(piId, event.account);
        }
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
        if (piId) await handleChargeRefunded(supabase, piId, charge.amount_refunded, charge.amount);
        break;
      }

      case 'payout.created':
      case 'payout.paid':
      case 'payout.failed':
      case 'payout.canceled': {
        await handlePayoutEvent(supabase, event);
        break;
      }

      case 'account.updated': {
        // Connect Standard account readiness changed (onboarding progress).
        // event.account is the connected account id. No-ops if untracked.
        if (event.account) await refreshAccountStatus(supabase, event.account);
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    handlerError = err instanceof Error ? err.message : String(err);
    console.error(`[Stripe Webhook] handler failed for ${event.id}:`, err);
  }

  await supabase
    .from('stripe_events')
    .update({
      // Only stamp handled_at on success. On error we leave it null so the
      // dedup guard (which skips rows with handled_at set) lets Stripe's retry
      // re-run the handler — matching the intent noted above. We still record
      // the error for observability.
      handled_at: handlerError ? null : new Date().toISOString(),
      error: handlerError,
    })
    .eq('event_id', event.id);

  if (handlerError) {
    // Return 500 so Stripe retries — our dedup guard ensures safe re-handling.
    return NextResponse.json({ error: handlerError }, { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
});
