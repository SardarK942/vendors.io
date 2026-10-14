/**
 * Shop SP2a checkout — E2E.
 *
 * A) Couple: add a made-to-measure lehenga to the bag → checkout is BLOCKED until
 *    measurements are attached → attach a saved profile → POST /api/checkout
 *    returns a Stripe-hosted url.
 * B) Vendor confirm: the OWNING vendor confirms a seeded pending_confirmation
 *    order (status → confirmed); a NON-owning vendor gets 403.
 *
 * Requires migrations 00087 + 00088 on the target DB and a Stripe TEST key
 * (STRIPE_SECRET_KEY=sk_test_...): Stripe is called server-side so it is hit
 * for real in test mode (checkout session create / PI capture). The vendor is
 * seeded WITHOUT a vendor_stripe_accounts row → "escrow" charge mode.
 * Cleanup: carts/cart_items/checkout_snapshots cascade from the user/vendor delete, but
 * orders.buyer_user_id and orders.vendor_profile_id have NO ON DELETE CASCADE, so Spec B
 * deletes its orders row FIRST (order_items + vendor_ledger cascade from orders);
 * otherwise deleteUser silently fails the FK and leaks users + a published vendor.
 */

import { test, expect } from '@playwright/test';
import {
  seedVendor,
  seedActiveProduct,
  seedCouple,
  seedMeasurementProfile,
  seedPendingShopOrder,
  getServiceClient,
  cleanup,
  type TestVendor,
  type TestUser,
} from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('shop checkout (couple, made-to-measure)', () => {
  let vendor: TestVendor | null = null;
  let couple: TestUser | null = null;

  test.afterEach(async () => {
    await cleanup(couple, vendor);
    vendor = null;
    couple = null;
  });

  test('MTM item blocks checkout until measurements attached, then returns a Stripe url', async ({
    page,
  }) => {
    vendor = await seedVendor({ publish: true, category: 'bridal_wear' });
    const product = await seedActiveProduct(vendor.vendorProfileId);
    couple = await seedCouple({ markOnboardingComplete: true });
    await seedMeasurementProfile(couple.id, 'E2E Bride');

    await loginAs(page, couple);

    // Add the in-stock M variant to the bag via the same API the PDP uses.
    const add = await page.request.post('/api/cart/items', {
      data: { product_id: product.id, variant_id: product.variantId, quantity: 1 },
    });
    expect(add.ok()).toBeTruthy();

    // ── Blocked: MTM line has no measurements yet ─────────────────────────────
    await page.goto('/bag');
    await expect(page.getByText(product.title).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Measurements needed')).toBeVisible();
    const checkoutBtn = page.getByRole('button', { name: /check out this boutique/i });
    await expect(checkoutBtn).toBeDisabled();
    await expect(page.getByText('Add measurements to continue')).toBeVisible();

    // The server enforces the same rule independent of the disabled button.
    const blocked = await page.request.post('/api/checkout', {
      data: { vendor_profile_id: vendor.vendorProfileId, fulfillment_type: 'pickup' },
    });
    expect(blocked.status()).toBe(409);

    // ── Attach the saved profile ──────────────────────────────────────────────
    await page.getByRole('button', { name: 'Add measurements' }).click();
    await page.getByLabel('Saved measurements').selectOption({ label: 'E2E Bride' });
    await expect(page.getByText(/Measurements added/)).toBeVisible({ timeout: 10_000 });
    await expect(checkoutBtn).toBeEnabled();

    // ── Checkout now returns a Stripe-hosted url ──────────────────────────────
    const ok = await page.request.post('/api/checkout', {
      data: { vendor_profile_id: vendor.vendorProfileId, fulfillment_type: 'pickup' },
    });
    expect(ok.status()).toBe(200);
    const body = (await ok.json()) as { url?: unknown };
    expect(typeof body.url).toBe('string');
    expect(String(body.url)).toMatch(/^https:\/\/checkout\.stripe\.com\//);
  });
});

test.describe('shop order vendor confirm', () => {
  let vendor: TestVendor | null = null;
  let otherVendor: TestVendor | null = null;
  let buyer: TestUser | null = null;
  let orderId: string | null = null;

  test.afterEach(async () => {
    // Orders FK users/vendor_profiles without cascade: delete the order first.
    if (orderId) await getServiceClient().from('orders').delete().eq('id', orderId);
    orderId = null;
    await cleanup(buyer, vendor, otherVendor);
    vendor = null;
    otherVendor = null;
    buyer = null;
  });

  test('owning vendor confirms → confirmed; non-owners are rejected (403)', async ({
    page,
    browser,
  }) => {
    vendor = await seedVendor({ publish: true, category: 'bridal_wear' });
    otherVendor = await seedVendor({ publish: true, category: 'bridal_wear' });
    buyer = await seedCouple({ markOnboardingComplete: true });
    const product = await seedActiveProduct(vendor.vendorProfileId);
    const seeded = await seedPendingShopOrder(vendor, buyer, product);
    orderId = seeded.orderId;
    const id = seeded.orderId;

    // ── Non-owning callers are rejected, order untouched ──────────────────────
    // RLS hides the order from an unrelated vendor, so the ownership gate answers
    // 404 for them (still a rejection). A caller who CAN see the order but does
    // not own the vendor profile (the buyer) hits the explicit 403 branch.
    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    await loginAs(otherPage, otherVendor);
    const deniedVendor = await otherPage.request.post(`/api/orders/${id}/confirm`);
    expect([403, 404]).toContain(deniedVendor.status());
    await otherContext.close();

    const buyerContext = await browser.newContext();
    const buyerPage = await buyerContext.newPage();
    await loginAs(buyerPage, buyer);
    const deniedBuyer = await buyerPage.request.post(`/api/orders/${id}/confirm`);
    expect(deniedBuyer.status()).toBe(403);
    await buyerContext.close();

    const db = getServiceClient();
    const { data: untouched } = await db.from('orders').select('status').eq('id', id).single();
    expect(untouched?.status).toBe('pending_confirmation');

    // ── Owning vendor confirms via the dashboard UI ───────────────────────────
    await loginAs(page, vendor);
    await page.goto(`/dashboard/orders/${id}`);
    await expect(page.getByText('Needs your confirmation')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /confirm, i'll make this/i }).click();
    await expect(page.getByText('You confirmed this order.')).toBeVisible({ timeout: 15_000 });

    const { data: confirmed } = await db
      .from('orders')
      .select('status, confirmed_at')
      .eq('id', id)
      .single();
    expect(confirmed?.status).toBe('confirmed');
    expect(confirmed?.confirmed_at).not.toBeNull();
  });
});
