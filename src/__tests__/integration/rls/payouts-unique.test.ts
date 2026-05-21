/**
 * Sub-project E §10 — payouts.stripe_payout_id UNIQUE regression guard.
 *
 * Ensures duplicate Stripe payout webhooks (which DO happen — Stripe retries
 * are common) can never create duplicate ledger rows. Migration 00034 enforces
 * this via UNIQUE on stripe_payout_id; this test fails if that constraint is
 * ever dropped.
 *
 * Skipped in CI without SUPABASE_SERVICE_ROLE_KEY.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const skip = !SUPABASE_URL || !SERVICE_KEY;
const suite = skip ? describe.skip : describe;

const TEST_PAYOUT_ID = `po_test_e_${Date.now()}`;

suite('payouts.stripe_payout_id UNIQUE constraint', () => {
  // Created inside the suite so module-load doesn't blow up when env vars are
  // absent (e.g. CI without secrets — the describe.skip then takes over).
  const sb = skip
    ? (null as never)
    : createClient<Database>(SUPABASE_URL, SERVICE_KEY, {
        auth: { persistSession: false },
      });

  let vendorProfileId: string | null = null;

  beforeAll(async () => {
    // Pick any existing vendor_profile in the dev DB — seeding a new one would
    // require an auth.users row, which we'd rather not create just for an FK.
    const { data } = await sb.from('vendor_profiles').select('id').limit(1).single();
    vendorProfileId = data?.id ?? null;
  });

  afterAll(async () => {
    await sb.from('payouts').delete().eq('stripe_payout_id', TEST_PAYOUT_ID);
  });

  it('rejects a second insert with the same stripe_payout_id', async () => {
    if (!vendorProfileId) {
      console.warn('[payouts-unique] no vendor_profile in dev DB; skipping');
      return;
    }
    const row = {
      vendor_profile_id: vendorProfileId,
      stripe_payout_id: TEST_PAYOUT_ID,
      amount_cents: 1000,
      status: 'paid' as const,
    };

    const first = await sb.from('payouts').insert(row);
    expect(first.error).toBeNull();

    const second = await sb.from('payouts').insert(row);
    expect(second.error).toBeTruthy();
    expect(second.error?.code).toBe('23505');
  });
});
