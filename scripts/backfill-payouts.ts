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
  // DEPRECATED: Bucket F T4 removed stripe_account_id from vendor_profiles.
  // This script is legacy and no longer functional. The schema migration that
  // removed this column also means vendor_profiles no longer owns stripe account
  // references. Use the stripe_accounts table directly instead.
  console.error(
    '[backfill] This script is DEPRECATED. Bucket F T4 removed stripe_account_id from vendor_profiles.'
  );
  process.exit(1);
}

main().catch((err) => {
  console.error('[backfill] fatal:', err);
  process.exit(1);
});
