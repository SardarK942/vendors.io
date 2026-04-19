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

test.describe('review flow', () => {
  let couple: TestUser | null = null;
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(couple, vendor);
    couple = null;
    vendor = null;
  });

  test('review denormalizes onto vendor_profiles (count + avg rating)', async ({ page }) => {
    couple = await seedCouple();
    vendor = await seedVendor({ chargesEnabled: true });
    const { id: bookingId } = await seedBooking(couple, vendor, {
      status: 'completed',
      eventDaysFromNow: -10,
    });

    await loginAs(page, couple);

    const res = await page.request.post('/api/reviews', {
      data: {
        bookingRequestId: bookingId,
        ratingOverall: 5,
        ratingQuality: 5,
        ratingCommunication: 4,
        ratingProfessionalism: 5,
        ratingValue: 4,
        comment: 'Fantastic work, highly recommend.',
      },
    });
    expect(res.status()).toBe(201);

    const supabase = getServiceClient();

    const { data: review } = await supabase
      .from('reviews')
      .select('rating_overall, comment')
      .eq('booking_request_id', bookingId)
      .single();
    expect(review?.rating_overall).toBe(5);

    // Trigger recalc_vendor_review_stats runs AFTER INSERT synchronously.
    const { data: vp } = await supabase
      .from('vendor_profiles')
      .select('review_count, average_rating')
      .eq('id', vendor.vendorProfileId)
      .single();
    expect(vp?.review_count).toBe(1);
    expect(Number(vp?.average_rating)).toBe(5);
  });

  test('duplicate review for same booking is rejected', async ({ page }) => {
    couple = await seedCouple();
    vendor = await seedVendor({ chargesEnabled: true });
    const { id: bookingId } = await seedBooking(couple, vendor, {
      status: 'completed',
      eventDaysFromNow: -10,
    });

    await loginAs(page, couple);

    const first = await page.request.post('/api/reviews', {
      data: { bookingRequestId: bookingId, ratingOverall: 4 },
    });
    expect(first.status()).toBe(201);

    const second = await page.request.post('/api/reviews', {
      data: { bookingRequestId: bookingId, ratingOverall: 3 },
    });
    // UNIQUE (booking_request_id) throws — route surfaces as 4xx/5xx.
    expect(second.ok()).toBe(false);
  });
});
