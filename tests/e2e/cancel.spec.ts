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

test.describe('cancel flow', () => {
  let couple: TestUser | null = null;
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(couple, vendor);
    couple = null;
    vendor = null;
  });

  test('couple cancels a pending booking (no refund)', async ({ page }) => {
    couple = await seedCouple();
    vendor = await seedVendor();
    const { id: bookingId } = await seedBooking(couple, vendor, { status: 'pending' });

    await loginAs(page, couple);

    const res = await page.request.post(`/api/bookings/${bookingId}/cancel`, {
      data: { reason: 'Changed our minds' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.new_status).toBe('couple_cancelled');
    expect(body.data.refund_amount_cents).toBe(0);

    const supabase = getServiceClient();
    const { data: booking } = await supabase
      .from('booking_requests')
      .select('status, cancellation_reason, cancellation_fault, cancelled_at')
      .eq('id', bookingId)
      .single();
    expect(booking?.status).toBe('couple_cancelled');
    expect(booking?.cancellation_reason).toBe('Changed our minds');
    expect(booking?.cancellation_fault).toBe('none');
    expect(booking?.cancelled_at).not.toBeNull();
  });

  test('double-cancel is rejected (409)', async ({ page }) => {
    couple = await seedCouple();
    vendor = await seedVendor();
    const { id: bookingId } = await seedBooking(couple, vendor, { status: 'pending' });

    await loginAs(page, couple);

    const first = await page.request.post(`/api/bookings/${bookingId}/cancel`, {
      data: {},
    });
    expect(first.status()).toBe(200);

    const second = await page.request.post(`/api/bookings/${bookingId}/cancel`, {
      data: {},
    });
    expect(second.status()).toBe(409);
  });
});
