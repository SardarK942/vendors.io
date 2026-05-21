/**
 * One-shot backfill of the payouts ledger from Stripe.
 *
 * Iterates every Connect account in stripe_accounts, calls stripe.payouts.list
 * for that account, upserts each payout into the payouts table. Idempotent via
 * the stripe_payout_id UNIQUE constraint — safe to re-run.
 *
 * Usage (against dev):
 *   tsx scripts/backfill-payouts.ts
 *
 * Usage (against prod — point env at prod Supabase + use the live Stripe key):
 *   STRIPE_SECRET_KEY=<sk_live...> \
 *   NEXT_PUBLIC_SUPABASE_URL=<prod-url> \
 *   SUPABASE_SERVICE_ROLE_KEY=<prod-key> \
 *     tsx scripts/backfill-payouts.ts
 *
 * Note: this script does NOT populate payout_bookings (the attribution table).
 * That's filled in by handlePayoutEvent on future payout.paid webhooks. The
 * backfill is for ledger visibility only — historical payouts will show their
 * amount and status, just not the contributing-bookings count.
 */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!STRIPE_SECRET || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    '[backfill] Missing env: STRIPE_SECRET_KEY + NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY'
  );
  process.exit(1);
}

// Use the SDK's pinned default api version (set by the installed @types/stripe).
const stripe = new Stripe(STRIPE_SECRET);
const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

const STATUS_MAP: Record<string, 'pending' | 'in_transit' | 'paid' | 'failed' | 'canceled'> = {
  pending: 'pending',
  in_transit: 'in_transit',
  paid: 'paid',
  failed: 'failed',
  canceled: 'canceled',
};

async function main() {
  const { data: accounts, error: accErr } = await supabase
    .from('stripe_accounts')
    .select('vendor_profile_id, stripe_account_id')
    .not('stripe_account_id', 'is', null);

  if (accErr) {
    console.error('[backfill] failed to read stripe_accounts:', accErr.message);
    process.exit(1);
  }

  let totalSeen = 0;
  let totalUpserted = 0;
  let totalSkipped = 0;

  for (const acc of accounts ?? []) {
    const accountId = acc.stripe_account_id;
    if (!accountId) continue;

    let cursor: string | undefined;
    while (true) {
      const payouts = await stripe.payouts.list(
        { limit: 100, starting_after: cursor },
        { stripeAccount: accountId }
      );

      for (const payout of payouts.data) {
        totalSeen++;
        const status = STATUS_MAP[payout.status];
        if (!status) {
          totalSkipped++;
          continue;
        }

        const arrivalDate = payout.arrival_date
          ? new Date(payout.arrival_date * 1000).toISOString().slice(0, 10)
          : null;

        const { error: upErr } = await supabase.from('payouts').upsert(
          {
            vendor_profile_id: acc.vendor_profile_id,
            stripe_payout_id: payout.id,
            amount_cents: payout.amount,
            currency: payout.currency,
            status,
            arrival_date: arrivalDate,
            failure_message: payout.failure_message ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'stripe_payout_id' }
        );

        if (upErr) {
          console.error(`[backfill] upsert failed for ${payout.id}:`, upErr.message);
        } else {
          totalUpserted++;
        }
      }

      if (!payouts.has_more) break;
      cursor = payouts.data[payouts.data.length - 1]?.id;
      if (!cursor) break;
    }
  }

  console.log(
    `[backfill] complete. accounts=${accounts?.length ?? 0} seen=${totalSeen} upserted=${totalUpserted} skipped=${totalSkipped}`
  );
}

main().catch((err) => {
  console.error('[backfill] fatal:', err);
  process.exit(1);
});
