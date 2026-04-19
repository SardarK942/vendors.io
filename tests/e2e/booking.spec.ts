import { test, expect } from '@playwright/test';
import {
  seedCouple,
  seedVendor,
  cleanup,
  getServiceClient,
  type TestUser,
  type TestVendor,
} from './helpers/seed';
import { loginAs } from './helpers/login';

// Golden path: couple creates a booking request → vendor sees it + submits quote.
// Stops at the Stripe deposit redirect (full webhook coverage needs stripe listen).

test.describe('booking golden path (up to quote)', () => {
  let couple: TestUser | null = null;
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(couple, vendor);
    couple = null;
    vendor = null;
  });

  test('couple submits request → vendor sees it → vendor quotes', async ({ browser }) => {
    couple = await seedCouple();
    vendor = await seedVendor({ chargesEnabled: true });

    // ── Couple session: submit booking request ───────────────────────────────
    const coupleCtx = await browser.newContext();
    const couplePage = await coupleCtx.newPage();
    await loginAs(couplePage, couple);

    await couplePage.goto(`/vendors/${vendor.vendorSlug}/book`);
    // A future date
    const future = new Date();
    future.setMonth(future.getMonth() + 6);
    const eventDate = future.toISOString().slice(0, 10);

    await couplePage.getByLabel('Event Date').fill(eventDate);
    await couplePage.getByRole('combobox').click();
    await couplePage
      .getByRole('option', { name: /wedding/i })
      .first()
      .click();
    await couplePage.getByLabel('Guest Count (estimated)').fill('150');
    await couplePage.getByLabel('Your Phone').fill('(312) 555-0100');
    await couplePage.getByLabel('Your Email').fill(couple.email);
    await couplePage.getByRole('button', { name: /submit booking request/i }).click();
    await couplePage.waitForURL(/\/dashboard\/bookings/, { timeout: 15_000 });

    // Verify DB state via service role.
    const supabase = getServiceClient();
    const { data: bookings } = await supabase
      .from('booking_requests')
      .select('id, status, couple_contact_revealed, couple_phone')
      .eq('couple_user_id', couple.id)
      .eq('vendor_profile_id', vendor.vendorProfileId);

    expect(bookings?.length).toBe(1);
    const bookingId = bookings![0].id;
    expect(bookings![0].status).toBe('pending');
    // Contact not revealed yet (pre-deposit).
    expect(bookings![0].couple_contact_revealed).toBe(false);

    await coupleCtx.close();

    // ── Vendor session: see booking + submit quote ───────────────────────────
    const vendorCtx = await browser.newContext();
    const vendorPage = await vendorCtx.newPage();
    await loginAs(vendorPage, vendor);

    await vendorPage.goto(`/dashboard/bookings/${bookingId}`);
    await expect(vendorPage.getByText(/awaiting quote|booking request/i).first()).toBeVisible();

    // Vendor should NOT see couple's contact info yet.
    await expect(vendorPage.getByText(/312.*555.*0100/)).toHaveCount(0);

    await vendorPage.getByLabel('Quote Amount ($)').fill('1500');
    await vendorPage.getByLabel('Notes for the Couple').fill('Test quote.');

    // Wait for the PUT to complete before asserting DB state.
    const [quoteResponse] = await Promise.all([
      vendorPage.waitForResponse(
        (r) =>
          r.url().includes(`/api/bookings/${bookingId}/quote`) && r.request().method() === 'PUT'
      ),
      vendorPage.getByRole('button', { name: /submit quote/i }).click(),
    ]);
    expect(quoteResponse.status()).toBe(200);

    const { data: quoted } = await supabase
      .from('booking_requests')
      .select('status, vendor_quote_amount')
      .eq('id', bookingId)
      .single();
    expect(quoted?.status).toBe('quoted');
    expect(quoted?.vendor_quote_amount).toBe(150_000); // cents

    await vendorCtx.close();
  });
});
