import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { EarningsSummary } from '@/lib/shop/earnings';

type Client = SupabaseClient<Database>;

/** Summarise a vendor's shop escrow ledger (service-role read). */
export async function getVendorEarningsSummary(
  db: Client,
  vendorProfileId: string,
  payoutsEnabled: boolean
): Promise<EarningsSummary> {
  const { data, error } = await db
    .from('vendor_ledger')
    .select('status, net_vendor_cents, transferred_at')
    .eq('vendor_profile_id', vendorProfileId);
  if (error) throw new Error(`earnings summary failed: ${error.message}`);

  const summary: EarningsSummary = {
    heldCents: 0,
    heldCount: 0,
    transferredCents: 0,
    lastTransferredAt: null,
    payoutsEnabled,
  };
  for (const row of data ?? []) {
    if (row.status === 'held') {
      summary.heldCents += row.net_vendor_cents;
      summary.heldCount += 1;
    } else if (row.status === 'transferred') {
      summary.transferredCents += row.net_vendor_cents;
      if (
        row.transferred_at &&
        (!summary.lastTransferredAt ||
          new Date(row.transferred_at) > new Date(summary.lastTransferredAt))
      ) {
        summary.lastTransferredAt = row.transferred_at;
      }
    }
  }
  return summary;
}
