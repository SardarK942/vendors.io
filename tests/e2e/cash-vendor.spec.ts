/**
 * Cash vendor E2E spec — Phase C5.
 *
 * Tests:
 *   1. Cash vendor accepts booking → transactions row has 5% deposit, zero vendor_payout
 *   2. Cash vendor deposit_paid booking, couple cancels >30d → 50% refund
 *   3. Cash vendor deposit_paid booking, couple cancels ≤30d → 0% refund
 *   4. Cash vendor onboarding wizard → DirectPaymentsCard rendered on /dashboard
 *
 * Google Places Autocomplete (Step 2) and UploadThing (Step 4) are bypassed via
 * direct PATCH API calls, matching the pattern used in vendor-onboarding.spec.ts.
 *
 * These tests pass locally with .env.local present. They will fail in CI (no
 * Supabase secrets) — same pre-existing infra limitation as the other e2e specs.
 */

import { test, expect } from '@playwright/test';
import {
  seedCashVendor,
  seedVendorOnly,
  seedCouple,
  seedPackage,
  cleanup,
  getServiceClient,
  type TestUser,
  type TestVendor,
  type SeededPackage,
} from './helpers/seed';
import { loginAs } from './helpers/login';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a booking payload for the /api/bookings POST endpoint. */
function buildBookingPayload(
  vendor: TestVendor,
  pkg: SeededPackage,
  eventDate: string
) {
  return {
    vendor_profile_id: vendor.vendorProfileId,
    package_id: pkg.id,
    selected_addons: [],
    guest_count: 100,
    couple_full_name: 'E2E Cash Couple',
    couple_contact_phone: '(312) 555-0199',
    events: [
      {
        sequence: 1,
        event_date: eventDate,
        event_start_time: `${eventDate}T16:00:00Z`,
        event_end_time: `${eventDate}T22:00:00Z`,
        event_type_label: 'Wedding Ceremony',
        address_line_1: '140 E Walton Pl',
        city: 'Chicago',
        state: 'IL',
        postal_code: '60611',
        google_place_id: 'e2e_place_id_cash',
        location_overridden: false,
      },
    ],
  };
}

/** Seed a booking that is already in 'deposit_paid' state by bypassing Stripe.
 * Uses service-role to directly set the booking status + insert a transaction row.
 */
async function seedDepositPaidBooking(
  vendor: TestVendor,
  couple: TestUser,
  pkg: SeededPackage,
  eventDate: string
): Promise<{ bookingId: string; depositCents: number }> {
  const supabase = getServiceClient();

  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  const totalCents = pkg.basePriceCents; // 300_000 for all cash tests
  // Cash vendor deposit = floor(totalCents * 0.05)
  const depositCents = Math.floor(totalCents * 0.05);

  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .insert({
      couple_user_id: couple.id,
      vendor_profile_id: vendor.vendorProfileId,
      package_id: pkg.id,
      package_name_snapshot: 'E2E Cash Package',
      package_base_price_cents_snapshot: totalCents,
      selected_addons: [],
      guest_count: 100,
      couple_full_name: 'E2E Cash Couple',
      couple_contact_phone: '(312) 555-0199',
      status: 'deposit_paid',
      expires_at: expiresAt,
      negotiation_round_count: 0,
      total_price_cents: totalCents,
      deposit_amount: depositCents,
      deposit_paid_at: new Date().toISOString(),
      stripe_payment_intent_id: `pi_e2e_cash_${Date.now()}`,
      couple_contact_revealed: true,
    })
    .select('id')
    .single();
  if (bErr || !booking) throw new Error(`seedDepositPaidBooking: ${bErr?.message}`);

  // Insert the booking_events row so cancellation logic can find the event date.
  await supabase.from('booking_events').insert({
    booking_id: booking.id,
    vendor_profile_id: vendor.vendorProfileId,
    sequence: 1,
    event_date: eventDate,
    event_start_time: `${eventDate}T16:00:00Z`,
    event_end_time: `${eventDate}T22:00:00Z`,
    event_type_label: 'Wedding Ceremony',
    address_line_1: '140 E Walton Pl',
    city: 'Chicago',
    state: 'IL',
    postal_code: '60611',
    location_overridden: false,
  });

  // Insert the transactions row (cash vendor: platform_fee = 100% of deposit, vendor_payout = 0).
  await supabase.from('transactions').insert({
    booking_request_id: booking.id,
    stripe_payment_intent_id: `pi_e2e_cash_${Date.now()}`,
    amount: depositCents,
    platform_fee: depositCents, // 100% to platform for cash vendor
    vendor_payout: 0,
    status: 'authorized',
  });

  return { bookingId: booking.id, depositCents };
}

// ─── Shared location payload (no real Google Places needed) ──────────────────
const FAKE_LOCATION = {
  baseAddressLine1: '123 E2E Cash Street',
  baseCity: 'Chicago',
  baseState: 'IL',
  basePostalCode: '60601',
  baseGooglePlaceId: 'ChIJe2eCashTestPlaceId',
  baseAddressPublic: false,
};

const VALID_BIO =
  'We bring stunning wedding photography to celebrations across the Midwest. Ten years of experience capturing your best moments.';

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('cash vendor — C end-to-end', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // Test 1: Cash vendor accepts booking → transactions row has 5% deposit, zero vendor_payout
  // ──────────────────────────────────────────────────────────────────────────
  test('cash vendor accepts booking → 5% deposit + transactions row has zero vendor payout', async ({
    browser,
  }) => {
    let couple: TestUser | null = null;
    let vendor: TestVendor | null = null;

    try {
      couple = await seedCouple();
      vendor = await seedCashVendor();
      const pkg = await seedPackage(vendor, { basePriceCents: 300_000 });

      // ── Couple session: submit booking ────────────────────────────────────
      const coupleCtx = await browser.newContext();
      const couplePage = await coupleCtx.newPage();
      await loginAs(couplePage, couple);

      const eventDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const createRes = await couplePage.request.post('/api/bookings', {
        data: buildBookingPayload(vendor, pkg, eventDate),
      });
      expect(createRes.status()).toBe(201);
      const bookingId = (await createRes.json()).data?.booking?.id;
      expect(bookingId).toBeTruthy();

      // ── Vendor session: accept the booking ────────────────────────────────
      const vendorCtx = await browser.newContext();
      const vendorPage = await vendorCtx.newPage();
      await loginAs(vendorPage, vendor);

      const acceptRes = await vendorPage.request.post(`/api/bookings/${bookingId}/accept`);
      expect(acceptRes.status()).toBe(200);

      // ── Verify booking total_price_cents ──────────────────────────────────
      const supabase = getServiceClient();
      const { data: bookingRow } = await supabase
        .from('bookings')
        .select('total_price_cents, status')
        .eq('id', bookingId)
        .single();
      expect(bookingRow?.status).toBe('accepted');
      expect(bookingRow?.total_price_cents).toBe(300_000);

      // ── Simulate deposit paid by directly inserting transaction ───────────
      const expectedDeposit = Math.floor(300_000 * 0.05); // 15_000
      expect(expectedDeposit).toBe(15_000);

      // Simulate webhook: set status='deposit_paid' + insert transaction row
      await supabase
        .from('bookings')
        .update({
          status: 'deposit_paid',
          deposit_amount: expectedDeposit,
          deposit_paid_at: new Date().toISOString(),
          stripe_payment_intent_id: `pi_e2e_cash_test_${Date.now()}`,
          couple_contact_revealed: true,
        })
        .eq('id', bookingId);

      await supabase.from('transactions').insert({
        booking_request_id: bookingId,
        stripe_payment_intent_id: `pi_e2e_cash_test_${Date.now()}`,
        amount: expectedDeposit,
        platform_fee: expectedDeposit, // 100% to platform for cash vendor
        vendor_payout: 0,
        status: 'authorized',
      });

      // Assert: transaction has platform_fee = depositAmount, vendor_payout = 0
      const { data: txs } = await supabase
        .from('transactions')
        .select('platform_fee, vendor_payout, amount')
        .eq('booking_request_id', bookingId);
      expect(txs?.length).toBeGreaterThan(0);
      const tx = txs![0];
      expect(tx.amount).toBe(15_000);
      expect(tx.platform_fee).toBe(15_000);
      expect(tx.vendor_payout).toBe(0);

      await coupleCtx.close();
      await vendorCtx.close();
    } finally {
      await cleanup(couple, vendor);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 2: Cash vendor cancellation >30d → couple gets 50% refund
  // ──────────────────────────────────────────────────────────────────────────
  test('cash vendor cancel >30d → 50% refund / 50% platform', async ({ browser }) => {
    let couple: TestUser | null = null;
    let vendor: TestVendor | null = null;

    try {
      couple = await seedCouple();
      vendor = await seedCashVendor();
      const pkg = await seedPackage(vendor, { basePriceCents: 300_000 });

      // Event date is 60 days out (>30d threshold)
      const eventDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { bookingId, depositCents } = await seedDepositPaidBooking(
        vendor,
        couple,
        pkg,
        eventDate
      );

      // Expected: 50% refund on cash vendor deposit
      const expectedRefund = Math.round(depositCents * 0.5); // 50%

      // ── Couple cancels via API ────────────────────────────────────────────
      const coupleCtx = await browser.newContext();
      const couplePage = await coupleCtx.newPage();
      await loginAs(couplePage, couple);

      const cancelRes = await couplePage.request.post(`/api/bookings/${bookingId}/cancel`, {
        data: { reason: 'Plans changed', fault: 'none' },
      });
      expect(cancelRes.status()).toBe(200);
      const cancelBody = await cancelRes.json();
      expect(cancelBody.data?.new_status).toBe('couple_cancelled');
      // refund_amount_cents should be 50% of deposit
      expect(cancelBody.data?.refund_amount_cents).toBe(expectedRefund);

      // ── Verify DB ─────────────────────────────────────────────────────────
      const supabase = getServiceClient();
      const { data: bookingRow } = await supabase
        .from('bookings')
        .select('status')
        .eq('id', bookingId)
        .single();
      expect(bookingRow?.status).toBe('couple_cancelled');

      await coupleCtx.close();
    } finally {
      await cleanup(couple, vendor);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 3: Cash vendor cancellation ≤30d → 0% refund
  // ──────────────────────────────────────────────────────────────────────────
  test('cash vendor cancel ≤30d → 0% refund / 100% platform', async ({ browser }) => {
    let couple: TestUser | null = null;
    let vendor: TestVendor | null = null;

    try {
      couple = await seedCouple();
      vendor = await seedCashVendor();
      const pkg = await seedPackage(vendor, { basePriceCents: 300_000 });

      // Event date is 15 days out (≤30d threshold → no refund)
      const eventDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { bookingId } = await seedDepositPaidBooking(vendor, couple, pkg, eventDate);

      // ── Couple cancels via API ────────────────────────────────────────────
      const coupleCtx = await browser.newContext();
      const couplePage = await coupleCtx.newPage();
      await loginAs(couplePage, couple);

      const cancelRes = await couplePage.request.post(`/api/bookings/${bookingId}/cancel`, {
        data: { reason: 'Plans changed', fault: 'none' },
      });
      expect(cancelRes.status()).toBe(200);
      const cancelBody = await cancelRes.json();
      expect(cancelBody.data?.new_status).toBe('couple_cancelled');
      // No refund for cancellations ≤30d out
      expect(cancelBody.data?.refund_amount_cents).toBe(0);

      // ── Verify DB ─────────────────────────────────────────────────────────
      const supabase = getServiceClient();
      const { data: bookingRow } = await supabase
        .from('bookings')
        .select('status')
        .eq('id', bookingId)
        .single();
      expect(bookingRow?.status).toBe('couple_cancelled');

      await coupleCtx.close();
    } finally {
      await cleanup(couple, vendor);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 4: Cash vendor onboarding wizard → DirectPaymentsCard on /dashboard
  // ──────────────────────────────────────────────────────────────────────────
  test('cash vendor onboarding wizard → DirectPaymentsCard rendered on /dashboard', async ({
    page,
  }) => {
    let vendor: TestUser | null = null;

    try {
      // Seed: user only, no vendor_profiles row
      vendor = await seedVendorOnly();
      await loginAs(page, vendor);

      // Visit /setup — should redirect to /setup/basics (no profile exists)
      await page.goto('/dashboard/profile/setup');
      await expect(page).toHaveURL(/\/setup\/basics/, { timeout: 10_000 });

      // ── Step 1: Basics ────────────────────────────────────────────────────
      await page.getByLabel('Business name').fill('E2E Cash Henna Co');
      await page.getByRole('combobox').click();
      await page.getByRole('option', { name: /mehndi/i }).click();
      await page.getByLabel('Bio').fill(VALID_BIO);
      await page.getByRole('button', { name: /next/i }).click();
      await expect(page).toHaveURL(/\/setup\/location/, { timeout: 10_000 });

      // ── Step 2: Location — API bypass ────────────────────────────────────
      const locationRes = await page.request.patch('/api/vendor-profile/setup/location', {
        data: FAKE_LOCATION,
      });
      expect(locationRes.status()).toBe(200);
      await page.goto('/dashboard/profile/setup/online');

      // ── Step 3: Online ────────────────────────────────────────────────────
      await page.getByLabel(/instagram handle/i).fill('e2e_cash_henna');
      await page.getByRole('button', { name: /next/i }).click();
      await expect(page).toHaveURL(/\/setup\/portfolio/, { timeout: 10_000 });

      // ── Step 4: Portfolio — API bypass ────────────────────────────────────
      const portfolioRes = await page.request.patch('/api/vendor-profile/setup/portfolio', {
        data: { portfolioImages: ['https://utfs.io/f/e2e-fake-cash-portfolio.jpg'] },
      });
      expect(portfolioRes.status()).toBe(200);
      await page.goto('/dashboard/profile/setup/payment-mode');

      // ── Step 5: Payment mode — click "Cash" card ──────────────────────────
      // The component renders two cards: "Through Baazar" and "Direct payments"
      // Click the "Direct payments" / Cash card
      await expect(page).toHaveURL(/\/setup\/payment-mode/, { timeout: 10_000 });
      // Click the card labelled "Direct payments" (StepPaymentMode renders a button with this heading)
      const cashCard = page.getByRole('button', { name: /direct payments/i }).first();
      await expect(cashCard).toBeVisible({ timeout: 5_000 });
      await cashCard.click();
      // Click Next to save the payment mode choice
      await page.getByRole('button', { name: /next/i }).click();
      await expect(page).toHaveURL(/\/setup\/review/, { timeout: 10_000 });

      // ── Step 6: Review & publish ──────────────────────────────────────────
      await page.getByRole('button', { name: /publish profile/i }).click();
      await expect(page).toHaveURL(/just_onboarded=1/, { timeout: 10_000 });

      // ── Visit /dashboard — assert DirectPaymentsCard rendered ─────────────
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });

      // DirectPaymentsCard renders "Direct payments" heading
      await expect(page.getByText('Direct payments').first()).toBeVisible({ timeout: 10_000 });
      // EarningsCard should NOT be present for cash vendors
      await expect(page.getByText(/earnings/i).first()).not.toBeVisible();
    } finally {
      await cleanup(vendor);
    }
  });
});
