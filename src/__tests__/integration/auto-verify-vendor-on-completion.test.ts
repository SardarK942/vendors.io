/**
 * Auto-verify trigger integration tests
 *
 * Tests the on_booking_completed trigger's verified-flip behavior (migration
 * 00066) against a real Supabase dev database.
 *
 * Requirements:
 *   - SUPABASE_SERVICE_ROLE_KEY env var must be present (set in .env.local)
 *   - Migration 00066 must have been applied to the dev DB
 *
 * Auto-skipped in CI where SERVICE_ROLE_KEY is absent.
 *
 * Run locally:
 *   npx dotenv-cli -e .env.local -- npm test -- auto-verify-vendor-on-completion
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

// Deterministic test UUIDs — never collide with real data
const TEST_USER_VENDOR_ID = '00000000-0000-0000-0000-0000000a001';
const TEST_USER_COUPLE_ID = '00000000-0000-0000-0000-0000000a002';
const TEST_VENDOR_ID = '00000000-0000-0000-0000-0000000a003';
const TEST_BOOKING_ID = '00000000-0000-0000-0000-0000000a004';

const hasServiceKey = Boolean(SERVICE_KEY);

describe.skipIf(!hasServiceKey)('Auto-verify trigger (migration 00066)', () => {
  let sb: ReturnType<typeof createClient<Database>>;

  beforeAll(async () => {
    sb = createClient<Database>(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // Seed vendor user
    await sb.from('users').upsert({
      id: TEST_USER_VENDOR_ID,
      email: 'auto-verify-vendor@test.local',
      full_name: 'Auto Verify Vendor',
      role: 'vendor',
    });

    // Seed couple user
    await sb.from('users').upsert({
      id: TEST_USER_COUPLE_ID,
      email: 'auto-verify-couple@test.local',
      full_name: 'Auto Verify Couple',
      role: 'couple',
    });
  });

  afterAll(async () => {
    // Clean up booking + vendor + users in dependency order
    await sb.from('bookings').delete().eq('id', TEST_BOOKING_ID);
    await sb.from('vendor_profiles').delete().eq('id', TEST_VENDOR_ID);
    await sb.from('users').delete().in('id', [TEST_USER_VENDOR_ID, TEST_USER_COUPLE_ID]);
  });

  beforeEach(async () => {
    // Reset state: vendor unverified + booking in deposit_paid
    await sb.from('bookings').delete().eq('id', TEST_BOOKING_ID);
    await sb.from('vendor_profiles').delete().eq('id', TEST_VENDOR_ID);

    await sb.from('vendor_profiles').upsert({
      id: TEST_VENDOR_ID,
      user_id: TEST_USER_VENDOR_ID,
      business_name: 'Auto Verify Studio',
      slug: 'auto-verify-studio',
      category: 'photography' as const,
      service_area: ['Chicago'],
      portfolio_images: [],
      verified: false,
      is_active: true,
      onboarding_complete: true,
    });

    await sb.from('bookings').upsert({
      id: TEST_BOOKING_ID,
      couple_user_id: TEST_USER_COUPLE_ID,
      vendor_profile_id: TEST_VENDOR_ID,
      status: 'deposit_paid',
    });
  });

  it('flips verified=false → true on booking completion', async () => {
    // Sanity: vendor starts unverified
    const { data: before } = await sb
      .from('vendor_profiles')
      .select('verified')
      .eq('id', TEST_VENDOR_ID)
      .single();
    expect(before?.verified).toBe(false);

    // Complete the booking
    await sb.from('bookings').update({ status: 'completed' }).eq('id', TEST_BOOKING_ID);

    // Vendor should be auto-verified
    const { data: after } = await sb
      .from('vendor_profiles')
      .select('verified')
      .eq('id', TEST_VENDOR_ID)
      .single();
    expect(after?.verified).toBe(true);
  });

  it('leaves an already-verified vendor verified (idempotent)', async () => {
    // Pre-verify the vendor
    await sb.from('vendor_profiles').update({ verified: true }).eq('id', TEST_VENDOR_ID);

    // Complete the booking
    await sb.from('bookings').update({ status: 'completed' }).eq('id', TEST_BOOKING_ID);

    // Still verified
    const { data: after } = await sb
      .from('vendor_profiles')
      .select('verified')
      .eq('id', TEST_VENDOR_ID)
      .single();
    expect(after?.verified).toBe(true);
  });

  it('does NOT flip verified on non-completed status changes (e.g. disputed)', async () => {
    // Move to disputed instead of completed
    await sb.from('bookings').update({ status: 'disputed' }).eq('id', TEST_BOOKING_ID);

    // Vendor stays unverified
    const { data: after } = await sb
      .from('vendor_profiles')
      .select('verified')
      .eq('id', TEST_VENDOR_ID)
      .single();
    expect(after?.verified).toBe(false);
  });
});
