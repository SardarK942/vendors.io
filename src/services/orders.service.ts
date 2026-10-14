// src/services/orders.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { ServiceResult } from '@/types';

type Client = SupabaseClient<Database>;

const CONFIRM_WINDOW_MS = 48 * 60 * 60 * 1000;
const CAS_ATTEMPTS = 5;

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
  const { sessionId, paymentIntentId, chargeMode, taxCents, totalCents } = input;

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
      charge_mode: chargeMode,
      item_subtotal_cents: subtotal,
      shipping_cents: shipping,
      tax_cents: taxCents,
      commission_cents: snap.commission_cents,
      total_cents: totalCents,
      fulfillment_type: snap.fulfillment_type,
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

  return { data: { orderId: order.id }, status: 201 };
}
