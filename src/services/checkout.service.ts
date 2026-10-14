import { createHash } from 'node:crypto';
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, FulfillmentType, Json } from '@/types/database.types';
import type { ServiceResult } from '@/types';
import { stripe } from '@/lib/stripe/client';
import { computeBoutiqueSummary, isReadyToCheckout } from '@/lib/shop/cart-pricing';
import { computeCommissionCents, resolveChargeMode } from '@/lib/shop/money';
import { getCartsForBuyer, type CartLineView } from '@/services/cart.service';

// Shop SP2a — authorize-at-checkout. Creates a hosted Stripe Checkout Session with
// manual capture (funds authorized, captured on vendor acceptance). Charge mode:
//   direct : vendor has charges_enabled -> session on the connected account + 10% app fee
//   escrow : otherwise -> platform-held charge, no app fee (commission taken at payout)

export interface CreateCheckoutInput {
  vendor_profile_id: string;
  fulfillment_type: FulfillmentType;
}

interface SnapshotLine {
  variant_id: string;
  product_id: string;
  name: string;
  variant_label: string;
  unit_price_cents: number;
  quantity: number;
  customization_type: 'standard_size' | 'made_to_measure';
  measurement_snapshot: { unit: string; measurements: Json } | null;
}

export async function createCheckoutSession(
  supabase: SupabaseClient<Database>,
  serviceClient: SupabaseClient<Database>,
  userId: string,
  input: CreateCheckoutInput
): Promise<ServiceResult<{ url: string }>> {
  const vendorProfileId = input.vendor_profile_id;

  // 1. Re-read the cart server-side; never trust client-supplied prices.
  const carts = await getCartsForBuyer(supabase, userId);
  if (carts.error || !carts.data) {
    return { error: carts.error ?? 'Could not load cart', status: carts.status || 500 };
  }
  const cart = carts.data.find((c) => c.vendorProfileId === vendorProfileId);
  if (!cart || cart.lines.length === 0) {
    return { error: 'Your bag for this boutique is empty', status: 404 };
  }
  const summary = computeBoutiqueSummary(cart.lines);
  if (!isReadyToCheckout(summary)) {
    return {
      error: 'Some items are out of stock or need measurements before checkout',
      status: 409,
    };
  }
  const subtotalCents = summary.subtotalCents;

  // 2. Charge mode from the vendor's connected-account status.
  const { data: acct } = await serviceClient
    .from('vendor_stripe_accounts')
    .select('stripe_account_id, charges_enabled')
    .eq('vendor_profile_id', vendorProfileId)
    .maybeSingle();
  const chargeMode = resolveChargeMode(acct?.charges_enabled === true);
  const commissionCents = computeCommissionCents(subtotalCents);

  // 3. Shipping.
  let shippingCents = 0;
  if (input.fulfillment_type === 'ship') {
    const { data: vp } = await supabase
      .from('vendor_profiles')
      .select('shop_shipping_fee_cents')
      .eq('id', vendorProfileId)
      .maybeSingle();
    shippingCents = vp?.shop_shipping_fee_cents ?? 0;
  }

  // 4. Frozen snapshot lines (MTM lines copy the attached measurement profile).
  const profileIds = Array.from(
    new Set(cart.lines.map((l) => l.measurementProfileId).filter((id): id is string => !!id))
  );
  const profileById = new Map<string, { unit: string; measurements: Json }>();
  if (profileIds.length > 0) {
    const { data: profiles, error: pErr } = await supabase
      .from('user_measurement_profiles')
      .select('id, unit, measurements')
      .in('id', profileIds);
    if (pErr) return { error: pErr.message, status: 500 };
    for (const p of profiles ?? []) {
      profileById.set(p.id, { unit: p.unit, measurements: p.measurements });
    }
  }
  const snapshotLines: SnapshotLine[] = cart.lines.map((l: CartLineView) => ({
    variant_id: l.variantId,
    product_id: l.productId,
    name: l.title,
    variant_label: l.sizeLabel,
    unit_price_cents: l.unitPriceCents,
    quantity: l.quantity,
    customization_type: l.isMadeToMeasure ? 'made_to_measure' : 'standard_size',
    measurement_snapshot:
      l.isMadeToMeasure && l.measurementProfileId
        ? (profileById.get(l.measurementProfileId) ?? null)
        : null,
  }));

  // 5. Build the Checkout Session.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData = {
    capture_method: 'manual',
    metadata: { kind: 'shop', buyer: userId, vendor: vendorProfileId },
  };
  if (chargeMode === 'direct') paymentIntentData.application_fee_amount = commissionCents;

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    line_items: snapshotLines.map((l) => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: l.variant_label ? `${l.name} (${l.variant_label})` : l.name,
          metadata: { variant_id: l.variant_id },
        },
        unit_amount: l.unit_price_cents,
      },
      quantity: l.quantity,
    })),
    automatic_tax: { enabled: true },
    payment_intent_data: paymentIntentData,
    metadata: { kind: 'shop' },
    success_url: `${appUrl}/orders?status=placed&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/bag`,
  };
  if (input.fulfillment_type === 'ship') {
    params.shipping_address_collection = { allowed_countries: ['US'] };
    params.shipping_options = [
      {
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: shippingCents, currency: 'usd' },
          display_name: 'Standard shipping',
        },
      },
    ];
  }

  const lineHash = createHash('sha256')
    .update(
      JSON.stringify([
        input.fulfillment_type,
        shippingCents,
        snapshotLines.map((l) => [l.variant_id, l.quantity, l.unit_price_cents]),
      ])
    )
    .digest('hex')
    .slice(0, 16);
  const idempotencyKey = `checkout:${userId}:${vendorProfileId}:${lineHash}`;

  let session: Stripe.Checkout.Session;
  try {
    session =
      chargeMode === 'direct' && acct
        ? await stripe.checkout.sessions.create(params, {
            idempotencyKey,
            stripeAccount: acct.stripe_account_id,
          })
        : await stripe.checkout.sessions.create(params, { idempotencyKey });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Could not start checkout',
      status: 502,
    };
  }
  if (!session.url) return { error: 'Stripe did not return a checkout URL', status: 502 };

  // 6. Persist the snapshot (service role: buyers have no insert policy).
  const { error: snapErr } = await serviceClient.from('checkout_snapshots').insert({
    stripe_checkout_session_id: session.id,
    buyer_user_id: userId,
    vendor_profile_id: vendorProfileId,
    charge_mode: chargeMode,
    fulfillment_type: input.fulfillment_type,
    lines: snapshotLines as unknown as Json,
    subtotal_cents: subtotalCents,
    shipping_cents: shippingCents,
    commission_cents: commissionCents,
  });
  if (snapErr) return { error: snapErr.message, status: 500 };

  return { data: { url: session.url }, status: 200 };
}
