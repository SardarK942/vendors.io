import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { stripe } from '@/lib/stripe/client';
import { logger } from '@/lib/logger';

type Client = SupabaseClient<Database>;

export interface TransferResult {
  transferredCount: number;
  transferredCents: number;
  failed: number;
}

export async function resolveSourceChargeId(
  db: Client,
  row: { order_id: string; source_charge_id: string | null }
): Promise<string | null> {
  if (row.source_charge_id) return row.source_charge_id;
  const { data: order } = await db
    .from('orders')
    .select('stripe_payment_intent_id')
    .eq('id', row.order_id)
    .maybeSingle();
  if (!order?.stripe_payment_intent_id) return null;
  try {
    const pi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id);
    const c = pi.latest_charge;
    return typeof c === 'string' ? c : (c?.id ?? null);
  } catch {
    return null;
  }
}

/**
 * Transfer a vendor's held escrow balance to their connected account. Idempotent
 * and safe to call repeatedly: no-ops unless the vendor is payouts-enabled with
 * held rows. One Stripe Transfer per ledger row, keyed by ledger id.
 */
export async function transferHeldEarnings(
  db: Client,
  vendorProfileId: string
): Promise<TransferResult> {
  const empty: TransferResult = { transferredCount: 0, transferredCents: 0, failed: 0 };

  const { data: account } = await db
    .from('vendor_stripe_accounts')
    .select('stripe_account_id, payouts_enabled')
    .eq('vendor_profile_id', vendorProfileId)
    .maybeSingle();
  if (!account?.stripe_account_id || !account.payouts_enabled) return empty;

  const { data: held } = await db
    .from('vendor_ledger')
    .select('id, order_id, net_vendor_cents, source_charge_id')
    .eq('vendor_profile_id', vendorProfileId)
    .eq('status', 'held');
  if (!held || held.length === 0) return empty;

  const result: TransferResult = { ...empty };
  for (const row of held) {
    try {
      const sourceCharge = await resolveSourceChargeId(db, row);
      const transfer = await stripe.transfers.create(
        {
          amount: row.net_vendor_cents,
          currency: 'usd',
          destination: account.stripe_account_id,
          ...(sourceCharge ? { source_transaction: sourceCharge } : {}),
          metadata: {
            kind: 'shop_escrow_transfer',
            order_id: row.order_id,
            ledger_id: row.id,
            vendor_profile_id: vendorProfileId,
          },
        },
        { idempotencyKey: `escrow-transfer:${row.id}` }
      );
      const { data: stamped, error } = await db
        .from('vendor_ledger')
        .update({
          status: 'transferred',
          transferred_at: new Date().toISOString(),
          stripe_transfer_id: transfer.id,
        })
        .eq('id', row.id)
        .eq('status', 'held')
        .select('id');
      if (error) {
        logger.error('escrow-transfer: stamp failed', { ledgerId: row.id, error: error.message });
        result.failed++;
        continue;
      }
      if (stamped && stamped.length > 0) {
        result.transferredCount++;
        result.transferredCents += row.net_vendor_cents;
      }
    } catch (err) {
      logger.error('escrow-transfer: transfer failed', err, { ledgerId: row.id, vendorProfileId });
      result.failed++;
    }
  }
  return result;
}
