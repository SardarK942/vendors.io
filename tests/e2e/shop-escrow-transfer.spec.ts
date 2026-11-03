/**
 * Shop SP2b escrow transfer — E2E (RUN DEFERRED, not part of CI).
 *
 * Seeds a vendor with a payouts-enabled vendor_stripe_accounts row (pointing at a
 * REAL connected Stripe TEST account), a confirmed escrow order, and a `held`
 * vendor_ledger row backed by a real test charge. Then drives the transfer via the
 * CRON_SECRET-guarded cron endpoint and asserts the ledger row becomes
 * `transferred` with a non-null stripe_transfer_id.
 *
 * Deferred like shop-checkout.spec.ts: it hits real Stripe test-mode Transfers and
 * is SKIPPED unless E2E_STRIPE_TRANSFER=1. Prerequisites:
 *   - migration 00089 applied on the target DB
 *   - STRIPE_SECRET_KEY=sk_test_... and CRON_SECRET set (app server AND this process)
 *   - E2E_CONNECT_TEST_ACCOUNT_ID=acct_... : a connected TEST account able to
 *     receive transfers (transfers capability active)
 * Run:
 *   E2E_STRIPE_TRANSFER=1 E2E_CONNECT_TEST_ACCOUNT_ID=acct_xxx \
 *     npx playwright test tests/e2e/shop-escrow-transfer.spec.ts
 *
 * Cleanup: orders have NO ON DELETE CASCADE from users/vendor_profiles, so the
 * orders row is deleted FIRST (vendor_ledger cascades from orders); then users.
 */

import { test, expect } from '@playwright/test';
import {
  seedVendor,
  seedCouple,
  seedStripeAccount,
  seedHeldLedgerRow,
  getServiceClient,
  cleanup,
  type TestVendor,
  type TestUser,
} from './helpers/seed';

const ENABLED = process.env.E2E_STRIPE_TRANSFER === '1';

test.describe('shop escrow transfer (cron → held earnings transferred)', () => {
  test.skip(
    !ENABLED,
    'Run deferred: needs migration 00089, sk_test_ and a transfer-capable Connect test account (E2E_STRIPE_TRANSFER=1)'
  );

  let vendor: TestVendor | null = null;
  let buyer: TestUser | null = null;
  let orderId: string | null = null;

  test.afterEach(async () => {
    if (orderId) await getServiceClient().from('orders').delete().eq('id', orderId);
    orderId = null;
    await cleanup(buyer, vendor);
    vendor = null;
    buyer = null;
  });

  test('cron transfers a held ledger row → transferred with a stripe_transfer_id', async ({
    request,
  }) => {
    const accountId = process.env.E2E_CONNECT_TEST_ACCOUNT_ID;
    const cronSecret = process.env.CRON_SECRET;
    if (!accountId || !cronSecret) {
      throw new Error('Set E2E_CONNECT_TEST_ACCOUNT_ID and CRON_SECRET to run this spec');
    }

    vendor = await seedVendor({ publish: true, category: 'bridal_wear' });
    buyer = await seedCouple({ markOnboardingComplete: true });
    const db = getServiceClient();
    await seedStripeAccount(db, vendor.vendorProfileId, {
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      stripe_account_id: accountId,
    });
    const held = await seedHeldLedgerRow(vendor, buyer);
    orderId = held.orderId;

    const res = await request.post('/api/cron/shop-escrow-transfer', {
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    expect(res.ok()).toBeTruthy();

    const { data: row } = await db
      .from('vendor_ledger')
      .select('status, stripe_transfer_id, transferred_at')
      .eq('id', held.ledgerId)
      .single();
    expect(row?.status).toBe('transferred');
    expect(row?.stripe_transfer_id).toMatch(/^tr_/);
    expect(row?.transferred_at).not.toBeNull();
  });
});
