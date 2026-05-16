import { test, expect } from '@playwright/test';
import {
  seedCouple,
  seedVendor,
  seedPackage,
  cleanup,
  getServiceClient,
  type TestUser,
  type TestVendor,
} from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('notifications — F end-to-end', () => {
  let couple: TestUser | null = null;
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(couple, vendor);
    couple = null;
    vendor = null;
  });

  test('couple booking → vendor sees notification row + bell badge', async ({ browser }) => {
    couple = await seedCouple();
    vendor = await seedVendor({ chargesEnabled: true });
    const pkg = await seedPackage(vendor, { basePriceCents: 150_000 });

    const coupleCtx = await browser.newContext();
    const couplePage = await coupleCtx.newPage();
    await loginAs(couplePage, couple);

    const eventDate = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
    const res = await couplePage.request.post('/api/bookings', {
      data: {
        vendor_profile_id: vendor.vendorProfileId,
        package_id: pkg.id,
        selected_addons: [],
        guest_count: 100,
        couple_full_name: 'E2E Couple',
        couple_contact_phone: '(312) 555-0100',
        events: [{
          sequence: 1, event_date: eventDate,
          event_start_time: `${eventDate}T16:00:00Z`,
          event_end_time: `${eventDate}T22:00:00Z`,
          event_type_label: 'Wedding Ceremony',
          address_line_1: '140 E Walton Pl', city: 'Chicago', state: 'IL', postal_code: '60611',
          location_overridden: false,
        }],
      },
    });
    expect(res.status()).toBe(201);

    // Verify notification row appears for vendor
    const supabase = getServiceClient();
    await expect.poll(async () => {
      const { data } = await supabase
        .from('notifications')
        .select('id, type, title')
        .eq('user_id', vendor!.id);
      return data;
    }, { timeout: 5_000 }).toHaveLength(1);

    const { data: notif } = await supabase
      .from('notifications')
      .select('type, title, body')
      .eq('user_id', vendor.id)
      .single();
    expect(notif?.type).toBe('booking_request_received');
    expect(notif?.body).toContain('Wedding Coverage');  // package name

    await coupleCtx.close();

    // Vendor side: bell badge + dropdown
    const vendorCtx = await browser.newContext();
    const vendorPage = await vendorCtx.newPage();
    await loginAs(vendorPage, vendor);

    await vendorPage.goto('/dashboard');
    // The bell badge should show "1"
    await expect(vendorPage.getByLabel(/Notifications.*1 unread/i)).toBeVisible();

    // Click bell → dropdown shows the notification
    await vendorPage.getByLabel(/Notifications.*1 unread/i).click();
    await expect(vendorPage.getByText(/new booking request/i).first()).toBeVisible();

    await vendorCtx.close();
  });

  test('mark-all-read clears unread count', async ({ browser }) => {
    couple = await seedCouple();
    vendor = await seedVendor({ chargesEnabled: true });
    const supabase = getServiceClient();

    // Seed 3 notifications directly
    await supabase.from('notifications').insert([
      { user_id: vendor.id, type: 'booking_request_received', title: 'A', body: 'body' },
      { user_id: vendor.id, type: 'deposit_paid', title: 'B', body: 'body' },
      { user_id: vendor.id, type: 'review_received', title: 'C', body: 'body' },
    ]);

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, vendor);
    await page.goto('/dashboard/notifications');

    await page.getByRole('button', { name: /mark all read/i }).click();

    // Poll DB until all are marked read
    await expect.poll(async () => {
      const { data } = await supabase
        .from('notifications')
        .select('read_at')
        .eq('user_id', vendor!.id);
      return data?.every((n) => n.read_at !== null);
    }, { timeout: 5_000 }).toBe(true);

    await ctx.close();
  });
});
