/**
 * Custom-request flow — happy path E2E.
 *
 * Covers the round-trip:
 *   1. Couple visits /vendors/{slug}/request and sends a custom request
 *   2. API creates a booking row (status='pending_quote') + fires notification/email
 *   3. Vendor opens /dashboard/bookings/{id} — sees banner + description + guest count
 *   4. Vendor sends first quote via /api/bookings/{id}/adjust
 *   5. Booking transitions to 'adjusted_quote_sent'
 *
 * Notes on why the couple's submit is done via `page.request.post` rather than
 * clicking through the form UI:
 * - The CustomRequestForm uses a react-day-picker DatePicker and a Radix Select
 *   EventTypePicker. Interacting with those from Playwright is possible but
 *   flaky in CI (portal timing + z-index).
 * - The API is the actual contract we care about — the form is a thin wrapper.
 *   We still navigate to /vendors/{slug}/request first to prove the page renders
 *   for the seeded couple against a seeded vendor (that's a real regression
 *   surface — /request has redirected to /login for logged-in users before).
 *
 * Same pattern as D.1 happy-path spec: two browser contexts (couple + vendor),
 * service-role client for DB assertions, cleanup on afterEach.
 */

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

test.describe('Custom request flow — couple submits → vendor replies with a quote', () => {
  let couple: TestUser | null = null;
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(couple, vendor);
    couple = null;
    vendor = null;
  });

  test('couple submits custom request → vendor sees it → vendor sends first quote', async ({
    browser,
  }) => {
    test.setTimeout(90_000);

    couple = await seedCouple({ markOnboardingComplete: true });
    vendor = await seedVendor({ publish: true });
    const sb = getServiceClient();

    // ── Browser contexts ────────────────────────────────────────────────────
    const coupleCtx = await browser.newContext();
    const couplePage = await coupleCtx.newPage();
    await loginAs(couplePage, couple);

    // ── 1. Couple lands on /vendors/{slug}/request ─────────────────────────
    await couplePage.goto(`/vendors/${vendor.vendorSlug}/request`);
    // The h1 reads: "Tell {business_name} what you need"
    await expect(couplePage.getByRole('heading', { name: /what you need/i })).toBeVisible();
    // Fieldset legend + textarea label — proves the form mounted client-side
    await expect(couplePage.getByText(/what do you need\?/i)).toBeVisible();

    // ── 2. Couple submits the custom request via API ───────────────────────
    // (Reuses the couple's session cookie — same auth boundary as the form.)
    const futureDate = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
    const description =
      'We are hosting a three-day South Asian wedding weekend in mid-summer, roughly 220 guests. ' +
      'We need a mehndi ceremony Saturday morning, a sangeet Saturday evening, and the reception ' +
      'on Sunday. Looking for a coordinated package outside your standard offerings — flexible ' +
      'on scope, firm on the dates. Please quote the whole weekend as a bundle.';

    const submitRes = await couplePage.request.post('/api/bookings/custom-request', {
      data: {
        vendor_slug: vendor.vendorSlug,
        events: [
          {
            date: futureDate,
            startTime: '15:00',
            guestCount: 220,
            eventTypeId: 'wedding',
          },
        ],
        description,
      },
    });
    expect(
      submitRes.status(),
      `POST /api/bookings/custom-request should return 200 (got ${submitRes.status()})`
    ).toBe(200);

    const submitBody = await submitRes.json();
    expect(submitBody.ok).toBe(true);
    const bookingId: string = submitBody.booking_id;
    expect(bookingId, 'response must include a booking_id').toBeTruthy();

    // ── 3. DB shape assertions on the seeded booking row ────────────────────
    const { data: bookingRow, error: bErr } = await sb
      .from('bookings')
      .select(
        'id, status, guest_count, event_type, special_requests, total_price_cents, vendor_profile_id, couple_user_id, package_id'
      )
      .eq('id', bookingId)
      .single();
    expect(bErr, 'booking row lookup should succeed').toBeNull();
    expect(bookingRow?.status).toBe('pending_quote');
    expect(bookingRow?.guest_count).toBe(220);
    expect(bookingRow?.event_type).toBe('wedding');
    // The endpoint concatenates description + optional multi-event JSON.
    // Single-event payload should store the description verbatim.
    expect(bookingRow?.special_requests).toContain('South Asian wedding weekend');
    expect(bookingRow?.total_price_cents).toBe(0);
    expect(bookingRow?.package_id).toBeNull();
    expect(bookingRow?.vendor_profile_id).toBe(vendor.vendorProfileId);
    expect(bookingRow?.couple_user_id).toBe(couple.id);

    // ── 4. Vendor logs in and views the incoming booking ───────────────────
    const vendorCtx = await browser.newContext();
    const vendorPage = await vendorCtx.newPage();
    await loginAs(vendorPage, vendor);
    await vendorPage.goto(`/dashboard/bookings/${bookingId}`);

    // Assert: pending_quote banner reads clearly for the vendor
    await expect(
      vendorPage.getByText(/couple sent a custom request/i).first()
    ).toBeVisible();
    // Assert: the couple's description surfaces on the vendor's booking page
    await expect(vendorPage.getByText(/South Asian wedding weekend/i).first()).toBeVisible();
    // Assert: guest count is rendered
    await expect(vendorPage.getByText(/^220$/).first()).toBeVisible();
    // Assert: the "Send quote" primary CTA is visible in the actions card
    await expect(
      vendorPage.getByRole('button', { name: /^send quote$/i }).first()
    ).toBeVisible();

    // ── 5. Vendor sends the first quote via /adjust ────────────────────────
    // A custom-request booking has total=0, so passing adjustment_amount_cents
    // = 500000 is the vendor saying "quote this weekend at $5,000".
    const adjustRes = await vendorPage.request.post(`/api/bookings/${bookingId}/adjust`, {
      data: {
        adjustment_amount_cents: 500_000,
        reason: 'custom',
        explanation: 'Three-event weekend bundle with a la carte upgrade options.',
      },
    });
    expect(
      adjustRes.status(),
      `POST /api/bookings/{id}/adjust should return 200 (got ${adjustRes.status()})`
    ).toBe(200);

    // ── 6. Booking now sits in 'adjusted_quote_sent' with the vendor's quote ──
    const { data: afterRow } = await sb
      .from('bookings')
      .select('status, adjustment_amount_cents, vendor_adjustment_count')
      .eq('id', bookingId)
      .single();
    expect(afterRow?.status).toBe('adjusted_quote_sent');
    expect(afterRow?.adjustment_amount_cents).toBe(500_000);
    expect(afterRow?.vendor_adjustment_count).toBe(1);

    await coupleCtx.close();
    await vendorCtx.close();
  });
});
