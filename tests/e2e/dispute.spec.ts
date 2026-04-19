import { test, expect } from '@playwright/test';
import {
  seedCouple,
  seedVendor,
  seedBooking,
  cleanup,
  getServiceClient,
  type TestUser,
  type TestVendor,
} from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('dispute flow', () => {
  let couple: TestUser | null = null;
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(couple, vendor);
    couple = null;
    vendor = null;
  });

  test('couple disputes a past-event deposit_paid booking', async ({ page }) => {
    couple = await seedCouple();
    vendor = await seedVendor({ chargesEnabled: true });
    // Event date 3 days ago so dispute is allowed.
    const { id: bookingId } = await seedBooking(couple, vendor, {
      status: 'deposit_paid',
      eventDaysFromNow: -3,
    });

    await loginAs(page, couple);

    const res = await page.request.post(`/api/bookings/${bookingId}/dispute`, {
      data: { reason: 'Photographer never showed up and has not responded to calls or emails.' },
    });
    expect(res.status()).toBe(200);

    const supabase = getServiceClient();
    const { data: booking } = await supabase
      .from('booking_requests')
      .select('status, disputed_at, dispute_reason')
      .eq('id', bookingId)
      .single();
    expect(booking?.status).toBe('disputed');
    expect(booking?.disputed_at).not.toBeNull();
    expect(booking?.dispute_reason).toContain('never showed up');
  });

  test('vendor cannot dispute (403)', async ({ page }) => {
    couple = await seedCouple();
    vendor = await seedVendor({ chargesEnabled: true });
    const { id: bookingId } = await seedBooking(couple, vendor, {
      status: 'deposit_paid',
      eventDaysFromNow: -3,
    });

    await loginAs(page, vendor);

    const res = await page.request.post(`/api/bookings/${bookingId}/dispute`, {
      data: { reason: 'I am the vendor trying to dispute — should be blocked.' },
    });
    expect(res.status()).toBe(403);
  });
});
