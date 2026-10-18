// src/services/orders.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/types/database.types';
import type { ServiceResult } from '@/types';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe/client';
import { computeEscrowNetCents } from '@/lib/shop/money';
import { logger } from '@/lib/logger';
import {
  notifyShopOrderPlaced,
  notifyShopOrderConfirmed,
  notifyShopOrderCancelled,
  notifyShopOutOfStock,
} from '@/services/shop-notifications.service';

type Client = SupabaseClient<Database>;

const CONFIRM_WINDOW_MS = 48 * 60 * 60 * 1000;
const CAS_ATTEMPTS = 5;

/** Fire a notification after a state transition; a failure is logged, never thrown. */
async function safeNotify(label: string, orderId: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    logger.error(`orders: ${label} notification failed`, err, { orderId });
  }
}

interface SnapshotLine {
  variant_id: string;
  product_id: string;
  name: string;
  variant_label: string | null;
  unit_price_cents: number;
  quantity: number;
  customization_type: string | null;
  measurement_snapshot: unknown;
}

export interface CreateOrderInput {
  sessionId: string;
  paymentIntentId: string;
  chargeMode: 'direct' | 'escrow';
  account: string | null;
  /** Authoritative tax collected by Stripe (session.total_details.amount_tax). */
  taxCents: number;
  /** Authoritative captured total (session.amount_total). */
  totalCents: number;
  /** Shipping address collected by Checkout ({name, address}); null for pickup. */
  shippingAddress?: ShippingAddress | null;
}

export interface ShippingAddress {
  name: string | null;
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    country: string | null;
  };
}

export type CreateOrderOutcome =
  | { orderId: string }
  | { skipped: 'duplicate' }
  | { voided: 'out_of_stock' };

function isMadeToMeasure(l: SnapshotLine): boolean {
  return l.customization_type === 'made_to_measure' || l.measurement_snapshot != null;
}

/**
 * Atomically adjust a variant's stock by `delta` (negative = decrement).
 * Supabase has no `col = col - n`, so this is a compare-and-swap: write only
 * if stock_quantity still equals the value we read, and retry on contention.
 * A decrement never goes below zero. Returns false if stock is insufficient.
 */
async function adjustStock(db: Client, variantId: string, delta: number): Promise<boolean> {
  for (let i = 0; i < CAS_ATTEMPTS; i++) {
    const { data: row } = await db
      .from('product_variants')
      .select('stock_quantity')
      .eq('id', variantId)
      .maybeSingle();
    if (!row) return false;
    const current = row.stock_quantity as number;
    const next = current + delta;
    if (next < 0) return false;
    const { data: updated } = await db
      .from('product_variants')
      .update({ stock_quantity: next })
      .eq('id', variantId)
      .eq('stock_quantity', current)
      .select('id');
    if (updated && updated.length === 1) return true;
  }
  return false;
}

async function rollbackStock(db: Client, done: Array<{ variantId: string; qty: number }>) {
  for (const d of done) {
    await adjustStock(db, d.variantId, d.qty);
  }
}

async function markSoldOutProducts(db: Client, productIds: string[]) {
  for (const productId of productIds) {
    const { data: variants } = await db
      .from('product_variants')
      .select('stock_quantity')
      .eq('product_id', productId);
    if (variants && variants.length > 0 && variants.every((v) => v.stock_quantity === 0)) {
      await db
        .from('products')
        .update({ status: 'out_of_stock' })
        .eq('id', productId)
        .eq('status', 'active');
    }
  }
}

/**
 * Build an order from the checkout snapshot after `checkout.session.completed`.
 * Idempotent on duplicate webhook delivery; guards stock so it never goes
 * negative. Service-role client required (webhook context).
 */
export async function createOrderFromSession(
  db: Client,
  input: CreateOrderInput
): Promise<ServiceResult<CreateOrderOutcome>> {
  const { sessionId, paymentIntentId, taxCents, totalCents } = input;
  const shippingAddress = input.shippingAddress ?? null;

  const { data: snap } = await db
    .from('checkout_snapshots')
    .select('*')
    .eq('stripe_checkout_session_id', sessionId)
    .maybeSingle();
  if (!snap) return { data: { skipped: 'duplicate' }, status: 200 };

  const { data: existing } = await db
    .from('orders')
    .select('id')
    .eq('stripe_checkout_session_id', sessionId)
    .maybeSingle();
  if (existing) {
    await db.from('checkout_snapshots').delete().eq('stripe_checkout_session_id', sessionId);
    return { data: { skipped: 'duplicate' }, status: 200 };
  }

  const lines = snap.lines as unknown as SnapshotLine[];

  // Guarded decrement; roll back this call's decrements on any shortfall.
  const done: Array<{ variantId: string; qty: number }> = [];
  for (const l of lines) {
    if (isMadeToMeasure(l)) continue;
    const ok = await adjustStock(db, l.variant_id, -l.quantity);
    if (!ok) {
      await rollbackStock(db, done);
      const soldOutLines = lines.filter((x) => !isMadeToMeasure(x)).map((x) => x.name);
      try {
        await notifyShopOutOfStock(db, {
          buyerUserId: snap.buyer_user_id as string,
          vendorProfileId: snap.vendor_profile_id as string,
          soldOutLines: Array.from(new Set(soldOutLines)),
        });
      } catch (err) {
        logger.error('orders: out-of-stock notification failed', err, { sessionId });
      }
      return { data: { voided: 'out_of_stock' }, status: 200 };
    }
    done.push({ variantId: l.variant_id, qty: l.quantity });
  }

  const subtotal = snap.subtotal_cents as number;
  const shipping = snap.shipping_cents as number;
  const { data: order, error: orderErr } = await db
    .from('orders')
    .insert({
      buyer_user_id: snap.buyer_user_id,
      vendor_profile_id: snap.vendor_profile_id,
      status: 'pending_confirmation',
      stripe_payment_intent_id: paymentIntentId,
      stripe_checkout_session_id: sessionId,
      charge_mode: snap.charge_mode as 'direct' | 'escrow',
      item_subtotal_cents: subtotal,
      shipping_cents: shipping,
      tax_cents: taxCents,
      commission_cents: snap.commission_cents,
      total_cents: totalCents,
      fulfillment_type: snap.fulfillment_type,
      shipping_address:
        snap.fulfillment_type === 'ship' ? (shippingAddress as unknown as Json | null) : null,
      confirm_deadline_at: new Date(Date.now() + CONFIRM_WINDOW_MS).toISOString(),
    })
    .select('id')
    .single();

  if (orderErr || !order) {
    await rollbackStock(db, done);
    // Unique violation = a concurrent delivery already created the order.
    if ((orderErr as { code?: string } | null)?.code === '23505') {
      return { data: { skipped: 'duplicate' }, status: 200 };
    }
    return { error: orderErr?.message ?? 'Failed to create order', status: 500 };
  }

  const { error: itemsErr } = await db.from('order_items').insert(
    lines.map((l) => ({
      order_id: order.id,
      product_id: l.product_id,
      variant_id: l.variant_id,
      product_name_snapshot: l.name,
      variant_label_snapshot: l.variant_label,
      unit_price_cents: l.unit_price_cents,
      quantity: l.quantity,
      line_subtotal_cents: l.unit_price_cents * l.quantity,
      customization_type: l.customization_type,
      measurement_snapshot: l.measurement_snapshot as never,
    }))
  );
  if (itemsErr) {
    await db.from('orders').delete().eq('id', order.id);
    await rollbackStock(db, done);
    return { error: itemsErr.message, status: 500 };
  }

  const affected = Array.from(
    new Set(lines.filter((l) => !isMadeToMeasure(l)).map((l) => l.product_id))
  );
  await markSoldOutProducts(db, affected);

  await db.from('checkout_snapshots').delete().eq('stripe_checkout_session_id', sessionId);
  await db
    .from('carts')
    .delete()
    .eq('user_id', snap.buyer_user_id)
    .eq('vendor_profile_id', snap.vendor_profile_id);

  await safeNotify('placed', order.id, () => notifyShopOrderPlaced(db, order.id));
  return { data: { orderId: order.id }, status: 201 };
}

// ---------------------------------------------------------------------------
// Confirm / decline / auto-void
// ---------------------------------------------------------------------------

export interface PendingOrder {
  id: string;
  vendor_profile_id: string;
  status: string;
  charge_mode: 'direct' | 'escrow';
  stripe_payment_intent_id: string | null;
  item_subtotal_cents: number;
  shipping_cents: number;
  commission_cents: number;
}

async function loadOrder(db: Client, orderId: string): Promise<PendingOrder | null> {
  const { data } = await db.from('orders').select('*').eq('id', orderId).maybeSingle();
  return (data as unknown as PendingOrder | null) ?? null;
}

/** Direct-charge PIs live on the vendor's connected account; escrow PIs on the platform. */
async function stripeRequestOptions(
  db: Client,
  order: PendingOrder,
  idempotencyKey: string
): Promise<{ idempotencyKey: string; stripeAccount?: string } | null> {
  if (order.charge_mode !== 'direct') return { idempotencyKey };
  const { data } = await db
    .from('vendor_stripe_accounts')
    .select('stripe_account_id')
    .eq('vendor_profile_id', order.vendor_profile_id)
    .maybeSingle();
  if (!data?.stripe_account_id) return null;
  return { idempotencyKey, stripeAccount: data.stripe_account_id };
}

/**
 * Insert the escrow vendor_ledger row for an order (no-op for direct charges).
 * order_id is unique: a duplicate (23505) means a prior attempt already wrote it.
 * Returns an error message, or null on success.
 */
function chargeIdOf(pi: { latest_charge?: string | { id?: string } | null }): string | null {
  const c = pi.latest_charge;
  return typeof c === 'string' ? c : (c?.id ?? null);
}

async function ensureEscrowLedger(
  db: Client,
  order: PendingOrder,
  sourceChargeId?: string | null
): Promise<string | null> {
  if (order.charge_mode !== 'escrow') return null;
  let chargeId = sourceChargeId ?? null;
  if (!chargeId && order.stripe_payment_intent_id) {
    try {
      const pi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id);
      chargeId = chargeIdOf(pi);
    } catch {
      chargeId = null; // non-fatal; transfer path has its own fallback
    }
  }
  const { error } = await db.from('vendor_ledger').insert({
    vendor_profile_id: order.vendor_profile_id,
    order_id: order.id,
    gross_cents: order.item_subtotal_cents + order.shipping_cents,
    commission_cents: order.commission_cents,
    stripe_fee_cents: 0,
    net_vendor_cents: computeEscrowNetCents({
      subtotalCents: order.item_subtotal_cents,
      shippingCents: order.shipping_cents,
      commissionCents: order.commission_cents,
      stripeFeeCents: 0,
    }),
    status: 'held',
    source_charge_id: chargeId,
  });
  if (error && (error as { code?: string }).code !== '23505') return error.message;
  return null;
}

// test-only
export const ensureEscrowLedgerForTest = ensureEscrowLedger;

/** Restore stock for an order's non-made-to-measure items and re-activate sold-out products. */
async function restoreOrderStock(db: Client, orderId: string): Promise<void> {
  const { data: items } = await db
    .from('order_items')
    .select('variant_id, product_id, quantity, customization_type, measurement_snapshot')
    .eq('order_id', orderId);

  const restored = new Set<string>();
  for (const it of items ?? []) {
    if (it.customization_type === 'made_to_measure' || it.measurement_snapshot != null) {
      continue;
    }
    const ok = await adjustStock(db, it.variant_id, it.quantity);
    if (!ok) {
      console.error(
        `[orders] stock restore failed for variant ${it.variant_id} (order ${orderId})`
      );
      continue;
    }
    restored.add(it.product_id);
  }

  for (const productId of Array.from(restored)) {
    const { data: variants } = await db
      .from('product_variants')
      .select('stock_quantity')
      .eq('product_id', productId);
    if (variants?.some((v) => (v.stock_quantity as number) > 0)) {
      await db
        .from('products')
        .update({ status: 'active' })
        .eq('id', productId)
        .eq('status', 'out_of_stock');
    }
  }
}

/**
 * Vendor confirms: capture the authorized PI, then mark confirmed. If the
 * capture throws the order is left pending_confirmation (the payment_intent.
 * succeeded webhook still finalizes if Stripe actually captured).
 */
export async function confirmOrder(
  db: Client,
  orderId: string
): Promise<ServiceResult<{ status: 'confirmed' }>> {
  const order = await loadOrder(db, orderId);
  if (!order) return { error: 'Order not found', status: 404 };
  if (order.status !== 'pending_confirmation') {
    return { error: 'Order is not awaiting confirmation', status: 409 };
  }
  if (!order.stripe_payment_intent_id) {
    return { error: 'Order has no payment intent', status: 500 };
  }

  const opts = await stripeRequestOptions(db, order, `order:${orderId}:capture`);
  if (!opts) return { error: 'Vendor Stripe account not found', status: 502 };

  let captured: Stripe.PaymentIntent;
  try {
    captured = await stripe.paymentIntents.capture(order.stripe_payment_intent_id, opts);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payment capture failed';
    console.error(`[orders] capture failed for order ${orderId}:`, message);
    return { error: `Payment capture failed: ${message}`, status: 502 };
  }

  const ledgerErr = await ensureEscrowLedger(db, order, chargeIdOf(captured));
  if (ledgerErr) return { error: ledgerErr, status: 502 };

  const { error: updErr } = await db
    .from('orders')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('status', 'pending_confirmation');
  if (updErr) return { error: updErr.message, status: 500 };

  await safeNotify('confirmed', orderId, () => notifyShopOrderConfirmed(db, orderId));
  return { data: { status: 'confirmed' }, status: 200 };
}

/** Cancel the authorization, restore stock, mark cancelled. */
export async function declineOrder(
  db: Client,
  orderId: string,
  reason?: string
): Promise<ServiceResult<{ status: 'cancelled' }>> {
  const order = await loadOrder(db, orderId);
  if (!order) return { error: 'Order not found', status: 404 };
  if (order.status !== 'pending_confirmation') {
    return { error: 'Order is not awaiting confirmation', status: 409 };
  }
  if (!order.stripe_payment_intent_id) {
    return { error: 'Order has no payment intent', status: 500 };
  }

  const opts = await stripeRequestOptions(db, order, `order:${orderId}:cancel`);
  if (!opts) return { error: 'Vendor Stripe account not found', status: 502 };

  try {
    await stripe.paymentIntents.cancel(order.stripe_payment_intent_id, opts);
  } catch (err) {
    // A prior cancel may have succeeded while the DB claim failed; treat an
    // already-canceled PI as success so retries (after the idempotency window) don't wedge.
    let alreadyCanceled = false;
    try {
      const pi = await stripe.paymentIntents.retrieve(
        order.stripe_payment_intent_id,
        {},
        opts.stripeAccount ? { stripeAccount: opts.stripeAccount } : undefined
      );
      alreadyCanceled = pi.status === 'canceled';
    } catch {
      alreadyCanceled = false;
    }
    if (!alreadyCanceled) {
      const message = err instanceof Error ? err.message : 'Payment cancel failed';
      console.error(`[orders] cancel failed for order ${orderId}:`, message);
      return { error: `Payment cancel failed: ${message}`, status: 502 };
    }
  }

  // Claim the transition first (conditional on still-pending) so stock is
  // restored exactly once even if declines race or are retried.
  const { data: claimed, error: updErr } = await db
    .from('orders')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_reason: reason ?? null,
    })
    .eq('id', orderId)
    .eq('status', 'pending_confirmation')
    .select('id');
  if (updErr) return { error: updErr.message, status: 500 };
  if (!claimed || claimed.length === 0) {
    return { error: 'Order is not awaiting confirmation', status: 409 };
  }

  await restoreOrderStock(db, orderId);

  await safeNotify('cancelled', orderId, () => notifyShopOrderCancelled(db, orderId));
  return { data: { status: 'cancelled' }, status: 200 };
}

/** Void every pending order past its confirm deadline. */
export async function autoVoidExpired(db: Client): Promise<ServiceResult<{ voided: number }>> {
  const { data: expired, error } = await db
    .from('orders')
    .select('id')
    .eq('status', 'pending_confirmation')
    .lt('confirm_deadline_at', new Date().toISOString());
  if (error) return { error: error.message, status: 500 };

  let voided = 0;
  for (const o of expired ?? []) {
    const r = await declineOrder(db, o.id, 'auto_void_timeout');
    if (!r.error) voided++;
  }
  return { data: { voided }, status: 200 };
}

// ---------------------------------------------------------------------------
// Webhook finalizers (idempotent; no Stripe calls — Stripe already acted)
// ---------------------------------------------------------------------------

async function loadOrderByPaymentIntent(
  db: Client,
  paymentIntentId: string
): Promise<PendingOrder | null> {
  const { data } = await db
    .from('orders')
    .select('*')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle();
  return (data as unknown as PendingOrder | null) ?? null;
}

/**
 * payment_intent.succeeded for a shop order: ensure it is confirmed (+ escrow
 * ledger). Safety net for when confirmOrder captured but its DB write failed.
 */
export async function finalizeOrderPaid(
  db: Client,
  paymentIntentId: string
): Promise<ServiceResult<{ status: string }>> {
  const order = await loadOrderByPaymentIntent(db, paymentIntentId);
  if (!order) return { error: 'Order not found', status: 404 };
  if (order.status !== 'pending_confirmation') {
    return { data: { status: order.status }, status: 200 };
  }

  const ledgerErr = await ensureEscrowLedger(db, order);
  if (ledgerErr) return { error: ledgerErr, status: 502 };

  const { data: claimed, error } = await db
    .from('orders')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
    .eq('id', order.id)
    .eq('status', 'pending_confirmation')
    .select('id');
  if (error) return { error: error.message, status: 500 };
  // Notify only when this call performed the transition (no duplicate emails).
  if (claimed && claimed.length > 0) {
    await safeNotify('confirmed', order.id, () => notifyShopOrderConfirmed(db, order.id));
  }
  return { data: { status: 'confirmed' }, status: 200 };
}

/**
 * payment_intent.canceled for a shop order: ensure it is cancelled and stock is
 * restored exactly once (the conditional claim guards against double restore).
 */
export async function finalizeOrderCanceled(
  db: Client,
  paymentIntentId: string
): Promise<ServiceResult<{ status: string }>> {
  const order = await loadOrderByPaymentIntent(db, paymentIntentId);
  // No order exists when we voided an out-of-stock session ourselves: nothing to
  // restore, and erroring here would trigger a Stripe retry storm.
  if (!order) return { data: { status: 'none' }, status: 200 };
  if (order.status !== 'pending_confirmation') {
    return { data: { status: order.status }, status: 200 };
  }

  const { data: claimed, error } = await db
    .from('orders')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', order.id)
    .eq('status', 'pending_confirmation')
    .select('id');
  if (error) return { error: error.message, status: 500 };
  if (!claimed || claimed.length === 0) return { data: { status: 'cancelled' }, status: 200 };

  await restoreOrderStock(db, order.id);
  await safeNotify('cancelled', order.id, () => notifyShopOrderCancelled(db, order.id));
  return { data: { status: 'cancelled' }, status: 200 };
}

/**
 * Delete checkout_snapshots older than `olderThanMs`. A completed checkout
 * deletes its own snapshot, so leftovers are orphans from abandoned or
 * out-of-stock-voided checkouts. Default 26h exceeds Stripe's 24h Checkout
 * session lifetime (+2h margin) so a late-authorizing buyer keeps their snapshot.
 */
export async function sweepStaleCheckoutSnapshots(
  db: Client,
  olderThanMs: number = 26 * 60 * 60 * 1000
): Promise<ServiceResult<{ swept: number }>> {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  const { data, error } = await db
    .from('checkout_snapshots')
    .delete()
    .lt('created_at', cutoff)
    .select('id');
  if (error) return { error: error.message, status: 500 };
  return { data: { swept: data?.length ?? 0 }, status: 200 };
}
