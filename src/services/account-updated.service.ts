import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { refreshAccountStatus } from '@/services/connect.service';
import { transferHeldEarnings } from '@/services/escrow-transfer.service';

type Client = SupabaseClient<Database>;

/**
 * Handle a Stripe `account.updated` event: refresh stored account flags, then,
 * if the vendor is now payouts-enabled, release their held escrow balance.
 * Idempotent: transferHeldEarnings no-ops when nothing is held.
 */
export async function handleAccountUpdated(db: Client, stripeAccountId: string): Promise<void> {
  await refreshAccountStatus(db, stripeAccountId);
  const { data: row } = await db
    .from('vendor_stripe_accounts')
    .select('vendor_profile_id, payouts_enabled')
    .eq('stripe_account_id', stripeAccountId)
    .maybeSingle();
  if (row?.payouts_enabled && row.vendor_profile_id) {
    await transferHeldEarnings(db, row.vendor_profile_id);
  }
}
