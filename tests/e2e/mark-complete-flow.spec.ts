/**
 * Mark-complete E2E flow — typed-confirm gate + auto-verify trigger.
 *
 * Verifies the financial-impact safety path introduced by PR #72/#74 and the
 * auto-verify trigger introduced by PR #77:
 *   1. Couple sees a "Mark Complete" button on a deposit_paid booking whose
 *      events have all ended.
 *   2. Clicking it opens a ConfirmDialog titled "Mark Booking Complete?".
 *   3. The confirm button "Mark Complete & Release Funds" is disabled until
 *      the user types the literal string "COMPLETE" into the input.
 *   4. On confirm, the API flips:
 *        - bookings.status                  → completed
 *        - transactions.status              → earned (via on_booking_completed trigger)
 *        - vendor_profiles.verified         → true   (via on_booking_completed trigger, PR #77)
 *
 * Bypasses Stripe deposit checkout by seeding a transactions row directly into
 * status='authorized'. The trigger flips that to 'earned' on completion.
 *
 * Cleanup: afterEach removes both users. ON DELETE CASCADE clears the booking,
 * booking_events, transactions, and any vendor profile rows.
 */

import { test, expect } from '@playwright/test';
import {
  seedCouple,
  seedVendor,
  seedPackage,
  seedPendingBooking,
  cleanup,
  getServiceClient,
  type TestUser,
  type TestVendor,
} from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('mark-complete flow — typed-confirm gate + auto-verify', () => {
  let couple: TestUser | null = null;
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(couple, vendor);
    couple = null;
    vendor = null;
  });

  test('couple marks complete via "COMPLETE" gate; vendor auto-verifies', async ({ page }) => {
    // ── seed ────────────────────────────────────────────────────────────────
    couple = await seedCouple({ markOnboardingComplete: true });
    vendor = await seedVendor({ chargesEnabled: true });
    const pkg = await seedPackage(vendor);

    // Past event window so completeBooking()'s lastEventEnd check passes.
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const eventDate = past.toISOString().slice(0, 10);
    const eventStart = new Date(past.getTime() - 4 * 60 * 60 * 1000).toISOString();
    const eventEnd = past.toISOString();

    const { bookingId } = await seedPendingBooking(vendor, couple, pkg, {
      eventDate,
      startTime: eventStart,
      endTime: eventEnd,
    });

    const sb = getServiceClient();

    // Push booking into deposit_paid (Stripe checkout would do this in prod).
    const depositCents = Math.round(pkg.basePriceCents * 0.05);
    const vendorPayoutCents = pkg.basePriceCents - depositCents;
    await sb
      .from('bookings')
      .update({
        status: 'deposit_paid',
        deposit_amount: depositCents,
        deposit_paid_at: new Date().toISOString(),
        couple_contact_revealed: true,
      })
      .eq('id', bookingId);

    // Insert a transactions row in 'authorized' so the trigger has something
    // to flip to 'earned' on completion (mirrors what the Stripe webhook does
    // on deposit checkout success).
    await sb.from('transactions').insert({
      booking_request_id: bookingId,
      stripe_payment_intent_id: `pi_e2e_${Date.now()}`,
      amount: pkg.basePriceCents,
      platform_fee: depositCents,
      vendor_payout: vendorPayoutCents,
      status: 'authorized',
    });

    // Sanity: vendor starts unverified (default schema is FALSE).
    const { data: vBefore } = await sb
      .from('vendor_profiles')
      .select('verified')
      .eq('id', vendor.vendorProfileId)
      .single();
    expect(vBefore?.verified).toBe(false);

    // ── drive UI ────────────────────────────────────────────────────────────
    await loginAs(page, couple);
    await page.goto(`/dashboard/bookings/${bookingId}`);

    // Mark Complete button is visible (couple + deposit_paid + past event).
    const markCompleteBtn = page.getByRole('button', { name: /^Mark Complete$/ });
    await expect(markCompleteBtn).toBeVisible();
    await markCompleteBtn.click();

    // ConfirmDialog opens with the right title.
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: /Mark Booking Complete\?/i })).toBeVisible();

    const confirmBtn = dialog.getByRole('button', { name: /Mark Complete & Release Funds/i });

    // Probe: confirm is disabled BEFORE typing the gate phrase.
    await expect(confirmBtn).toBeDisabled();

    // Probe: typing wrong phrase keeps it disabled.
    const typedInput = dialog.getByLabel(/Type\s+COMPLETE\s+to confirm\./i);
    await typedInput.fill('complete'); // lowercase
    await expect(confirmBtn).toBeDisabled();

    // Type the exact gate phrase → button enables.
    await typedInput.fill('COMPLETE');
    await expect(confirmBtn).toBeEnabled();

    // Confirm. Wait for success toast.
    await confirmBtn.click();
    await expect(page.getByText(/Booking marked complete/i)).toBeVisible({ timeout: 10_000 });

    // ── assert post-state ───────────────────────────────────────────────────
    const { data: bAfter } = await sb
      .from('bookings')
      .select('status, completed_at')
      .eq('id', bookingId)
      .single();
    expect(bAfter?.status).toBe('completed');
    expect(bAfter?.completed_at).not.toBeNull();

    const { data: txAfter } = await sb
      .from('transactions')
      .select('status, vendor_earned_at')
      .eq('booking_request_id', bookingId)
      .single();
    expect(txAfter?.status).toBe('earned');
    expect(txAfter?.vendor_earned_at).not.toBeNull();

    // Auto-verify trigger (PR #77, migration 00066) flipped the vendor.
    const { data: vAfter } = await sb
      .from('vendor_profiles')
      .select('verified')
      .eq('id', vendor.vendorProfileId)
      .single();
    expect(vAfter?.verified).toBe(true);
  });
});
