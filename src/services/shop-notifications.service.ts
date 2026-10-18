// Shop order notifications: vendor (bell + email), buyer email, and an
// internal ops email so Baazar can phone the vendor. Every function here is
// best-effort and NEVER throws — a notification failure must not break the
// money/state path that calls it.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { logger } from '@/lib/logger';
import { escapeHtml, sendShopEmail, SHOP_OPS_EMAIL } from '@/lib/email/resend';
import { notifyShopOrder } from '@/services/notifications.service';

type Client = SupabaseClient<Database>;

interface OrderContext {
  orderId: string;
  totalCents: number;
  status: string;
  cancelReason: string | null;
  summary: string;
  vendorName: string;
  vendorUserId: string;
  vendorEmail: string | null;
  vendorPhone: string | null;
  buyerEmail: string | null;
}

function fmtUsd(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

async function loadContext(db: Client, orderId: string): Promise<OrderContext | null> {
  const { data: order } = await db.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (!order) return null;

  const { data: vendor } = await db
    .from('vendor_profiles')
    .select('business_name, user_id')
    .eq('id', order.vendor_profile_id)
    .maybeSingle();
  if (!vendor) return null;

  const { data: vendorUser } = await db
    .from('users')
    .select('email, phone')
    .eq('id', vendor.user_id)
    .maybeSingle();
  const { data: buyer } = await db
    .from('users')
    .select('email')
    .eq('id', order.buyer_user_id)
    .maybeSingle();
  const { data: items } = await db
    .from('order_items')
    .select('product_name_snapshot, variant_label_snapshot, quantity')
    .eq('order_id', orderId);

  const summary = (items ?? [])
    .map(
      (i) =>
        `${i.quantity} x ${i.product_name_snapshot}${
          i.variant_label_snapshot ? ` (${i.variant_label_snapshot})` : ''
        }`
    )
    .join(', ');

  return {
    orderId,
    totalCents: order.total_cents,
    status: order.status,
    cancelReason: order.cancel_reason,
    summary: summary || '(no items)',
    vendorName: vendor.business_name,
    vendorUserId: vendor.user_id,
    vendorEmail: vendorUser?.email ?? null,
    vendorPhone: vendorUser?.phone ?? null,
    buyerEmail: buyer?.email ?? null,
  };
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

async function sendOpsEmail(ctx: OrderContext, subject: string, lead: string): Promise<void> {
  await sendShopEmail({
    to: SHOP_OPS_EMAIL,
    subject,
    html: `
      <h2>${escapeHtml(lead)}</h2>
      <p><strong>Order id:</strong> <code>${escapeHtml(ctx.orderId)}</code></p>
      <p><strong>Vendor:</strong> ${escapeHtml(ctx.vendorName)}</p>
      <p><strong>Vendor phone:</strong> ${escapeHtml(ctx.vendorPhone ?? '(none on file)')}</p>
      <p><strong>Vendor email:</strong> ${escapeHtml(ctx.vendorEmail ?? '(none)')}</p>
      <p><strong>Order:</strong> ${escapeHtml(ctx.summary)} &mdash; ${escapeHtml(fmtUsd(ctx.totalCents))}</p>
      <p><strong>Status:</strong> ${escapeHtml(ctx.status)}</p>
    `,
  });
}

async function run(label: string, orderId: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    logger.error(`shop-notifications: ${label} failed`, err, { orderId });
  }
}

const VENDOR_LINK = '/dashboard/orders';

export async function notifyShopOrderPlaced(db: Client, orderId: string): Promise<void> {
  await run('notifyShopOrderPlaced', orderId, async () => {
    const ctx = await loadContext(db, orderId);
    if (!ctx) return;
    const title = 'New order: confirm within 48 hours';
    const body = `${ctx.summary} (${fmtUsd(ctx.totalCents)}). Confirm within 48 hours or it will be voided.`;
    await notifyShopOrder(db, ctx.vendorUserId, 'shop_order_placed', {
      orderId,
      title,
      body,
      link: VENDOR_LINK,
    });
    if (ctx.vendorEmail) {
      await sendShopEmail({
        to: ctx.vendorEmail,
        subject: title,
        html: `<p>${escapeHtml(body)}</p><p>Order ${escapeHtml(shortId(orderId))}. Open your dashboard to confirm or decline.</p>`,
      });
    }
    await sendOpsEmail(
      ctx,
      `[Shop order] ${ctx.vendorName} #${shortId(orderId)}`,
      'New shop order placed'
    );
  });
}

export async function notifyShopOrderConfirmed(db: Client, orderId: string): Promise<void> {
  await run('notifyShopOrderConfirmed', orderId, async () => {
    const ctx = await loadContext(db, orderId);
    if (!ctx) return;
    const body = `${ctx.vendorName} confirmed order ${shortId(orderId)}: ${ctx.summary}.`;
    await notifyShopOrder(db, ctx.vendorUserId, 'shop_order_confirmed', {
      orderId,
      title: 'Order confirmed',
      body,
      link: VENDOR_LINK,
    });
    if (ctx.vendorEmail) {
      await sendShopEmail({
        to: ctx.vendorEmail,
        subject: 'Order confirmed',
        html: `<p>${escapeHtml(body)}</p><p>Payment has been captured.</p>`,
      });
    }
    if (ctx.buyerEmail) {
      await sendShopEmail({
        to: ctx.buyerEmail,
        subject: 'Your order is confirmed',
        html: `<p>${escapeHtml(ctx.vendorName)} confirmed your order: ${escapeHtml(ctx.summary)} (${escapeHtml(fmtUsd(ctx.totalCents))}). Your card has been charged.</p>`,
      });
    }
  });
}

export async function notifyShopOrderCancelled(db: Client, orderId: string): Promise<void> {
  await run('notifyShopOrderCancelled', orderId, async () => {
    const ctx = await loadContext(db, orderId);
    if (!ctx) return;
    const body = `Order ${shortId(orderId)} (${ctx.summary}) was cancelled.`;
    await notifyShopOrder(db, ctx.vendorUserId, 'shop_order_cancelled', {
      orderId,
      title: 'Order cancelled',
      body,
      link: VENDOR_LINK,
    });
    if (ctx.vendorEmail) {
      await sendShopEmail({
        to: ctx.vendorEmail,
        subject: 'Order cancelled',
        html: `<p>${escapeHtml(body)}</p>`,
      });
    }
    if (ctx.buyerEmail) {
      await sendShopEmail({
        to: ctx.buyerEmail,
        subject: 'Your order was cancelled',
        html: `<p>Your order from ${escapeHtml(ctx.vendorName)} (${escapeHtml(ctx.summary)}) was cancelled. You have not been charged; any card authorization is released.</p>`,
      });
    }
    await sendOpsEmail(
      ctx,
      `[Shop order cancelled] ${ctx.vendorName} #${shortId(orderId)}`,
      `Shop order cancelled${ctx.cancelReason ? ` (${ctx.cancelReason})` : ''}`
    );
  });
}

export async function notifyShopConfirmReminder(db: Client, orderId: string): Promise<void> {
  await run('notifyShopConfirmReminder', orderId, async () => {
    const ctx = await loadContext(db, orderId);
    if (!ctx) return;
    const title = 'Reminder: confirm your order';
    const body = `Order ${shortId(orderId)} (${ctx.summary}) will be voided in about 24 hours unless you confirm.`;
    await notifyShopOrder(db, ctx.vendorUserId, 'shop_order_reminder', {
      orderId,
      title,
      body,
      link: VENDOR_LINK,
    });
    if (ctx.vendorEmail) {
      await sendShopEmail({
        to: ctx.vendorEmail,
        subject: title,
        html: `<p>${escapeHtml(body)}</p>`,
      });
    }
    await sendOpsEmail(
      ctx,
      `[Shop order reminder] ${ctx.vendorName} #${shortId(orderId)}`,
      'Vendor has not confirmed; ~24h left'
    );
  });
}

/** Ops-only alert, e.g. when a vendor's confirm fails at capture. */
export async function notifyShopOpsAlert(
  db: Client,
  orderId: string,
  message: string
): Promise<void> {
  await run('notifyShopOpsAlert', orderId, async () => {
    const ctx = await loadContext(db, orderId);
    if (!ctx) {
      await sendShopEmail({
        to: SHOP_OPS_EMAIL,
        subject: `[Shop order alert] #${shortId(orderId)}`,
        html: `<p>${escapeHtml(message)}</p><p>Order id: <code>${escapeHtml(orderId)}</code></p>`,
      });
      return;
    }
    await sendOpsEmail(ctx, `[Shop order alert] ${ctx.vendorName} #${shortId(orderId)}`, message);
  });
}

/**
 * Vendor notice (bell + email) when held escrow earnings are paid out to their
 * connected account. Best-effort; never throws.
 */
export async function notifyFundsTransferred(
  db: Client,
  vendorProfileId: string,
  amountCents: number
): Promise<void> {
  await run('notifyFundsTransferred', vendorProfileId, async () => {
    const { data: vendor } = await db
      .from('vendor_profiles')
      .select('user_id')
      .eq('id', vendorProfileId)
      .maybeSingle();
    if (!vendor) return;
    const { data: vendorUser } = await db
      .from('users')
      .select('email')
      .eq('id', vendor.user_id)
      .maybeSingle();
    const title = 'Your earnings were paid out';
    const body = `Your held earnings of ${fmtUsd(amountCents)} have been paid out to your connected account.`;
    await notifyShopOrder(db, vendor.user_id, 'shop_funds_transferred', {
      orderId: '',
      title,
      body,
      link: VENDOR_LINK,
    });
    if (vendorUser?.email) {
      await sendShopEmail({
        to: vendorUser.email,
        subject: title,
        html: `<p>${escapeHtml(body)}</p>`,
      });
    }
  });
}

/**
 * Buyer-facing notice when a paid checkout is voided because an item sold out
 * before the order was recorded. The authorization is cancelled, so no charge.
 */
export async function notifyShopOutOfStock(
  db: Client,
  input: { buyerUserId: string; vendorProfileId: string; soldOutLines: string[] }
): Promise<void> {
  await run('notifyShopOutOfStock', input.vendorProfileId, async () => {
    const { data: buyer } = await db
      .from('users')
      .select('email')
      .eq('id', input.buyerUserId)
      .maybeSingle();
    const { data: vendor } = await db
      .from('vendor_profiles')
      .select('business_name')
      .eq('id', input.vendorProfileId)
      .maybeSingle();
    const shop = vendor?.business_name ?? 'the boutique';
    const items = input.soldOutLines.length > 0 ? input.soldOutLines.join(', ') : 'An item';
    const body = `${items} just sold out at ${shop} before your order completed. You have NOT been charged.`;
    if (buyer?.email) {
      await sendShopEmail({
        to: buyer.email,
        subject: 'An item sold out before your order completed',
        html: `<p>${escapeHtml(body)}</p><p>Any card authorization is released. You can browse the shop again anytime.</p>`,
      });
    }
  });
}
