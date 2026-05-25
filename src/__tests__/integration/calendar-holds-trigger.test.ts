/**
 * G1.3 — Calendar holds trigger integration tests
 *
 * Tests the capacity-check BEFORE INSERT trigger and the status-sync
 * AFTER UPDATE trigger against a real Supabase dev database.
 *
 * Requirements:
 *   - SUPABASE_SERVICE_ROLE_KEY env var must be present (set in .env.local)
 *   - Migration 00032 must have been applied to the dev DB
 *
 * These tests are automatically skipped in CI where SERVICE_ROLE_KEY is absent.
 *
 * Run locally:
 *   npx dotenv-cli -e .env.local -- npm test -- calendar-holds-trigger
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

// Deterministic test UUIDs — never collide with real data
const TEST_USER_ID = '00000000-0000-0000-0000-000000000g01';
const TEST_VENDOR_ID = '00000000-0000-0000-0000-000000000g02';
const TEST_BOOKING_ID = '00000000-0000-0000-0000-000000000g03';
const TEST_EVENT_ID = '00000000-0000-0000-0000-000000000g04';

// Seed helpers (run once per describe block)
async function seedVendor(sb: ReturnType<typeof createClient<Database>>, capacity = 1) {
  // Upsert a minimal user row
  await sb.from('users').upsert({
    id: TEST_USER_ID,
    email: 'g-test-vendor@test.local',
    full_name: 'G Test Vendor',
    role: 'vendor',
  });

  // Upsert a vendor profile
  await sb.from('vendor_profiles').upsert({
    id: TEST_VENDOR_ID,
    user_id: TEST_USER_ID,
    business_name: 'G Test Studio',
    slug: 'g-test-studio',
    category: 'photography' as const,
    service_area: ['London'],
    portfolio_images: [],
    is_active: true,
    onboarding_complete: true,
    concurrent_capacity: capacity,
  });
}

async function seedBookingAndEvent(sb: ReturnType<typeof createClient<Database>>) {
  // Insert a couple user for FK constraint
  await sb.from('users').upsert({
    id: '00000000-0000-0000-0000-000000000g05',
    email: 'g-test-couple@test.local',
    full_name: 'G Test Couple',
    role: 'couple',
  });

  // Insert a pending booking
  await sb.from('bookings').upsert({
    id: TEST_BOOKING_ID,
    couple_user_id: '00000000-0000-0000-0000-000000000g05',
    vendor_profile_id: TEST_VENDOR_ID,
    status: 'pending',
    total_price_cents: 100000,
    selected_addons: [],
    adjustment_amount_cents: 0,
    negotiation_round_count: 0,
  });

  // Insert a booking_event on 2026-08-15 10:00–12:00
  await sb.from('booking_events').upsert({
    id: TEST_EVENT_ID,
    booking_id: TEST_BOOKING_ID,
    sequence: 1,
    event_date: '2026-08-15',
    event_start_time: '10:00:00',
    event_end_time: '12:00:00',
    event_type_label: 'Mehndi',
    address_line_1: '1 Test St',
    city: 'London',
    state: 'England',
    postal_code: 'E1 1AA',
  });
}

async function cleanup(sb: ReturnType<typeof createClient<Database>>) {
  await sb.from('vendor_calendar_holds').delete().eq('vendor_profile_id', TEST_VENDOR_ID);
  await sb.from('booking_events').delete().eq('id', TEST_EVENT_ID);
  await sb.from('bookings').delete().eq('id', TEST_BOOKING_ID);
  await sb.from('vendor_profiles').delete().eq('id', TEST_VENDOR_ID);
  await sb.from('users').delete().in('id', [TEST_USER_ID, '00000000-0000-0000-0000-000000000g05']);
}

// Skip when SUPABASE_SERVICE_ROLE_KEY is not set (CI)
const hasServiceKey = Boolean(SERVICE_KEY && SUPABASE_URL);

describe.skipIf(!hasServiceKey)('vendor_calendar_holds — capacity trigger (integration)', () => {
  let sb: ReturnType<typeof createClient<Database>>;

  beforeAll(async () => {
    sb = createClient<Database>(SUPABASE_URL, SERVICE_KEY);
    await seedVendor(sb, 1);
  });

  afterAll(async () => {
    await cleanup(sb);
  });

  afterEach(async () => {
    // Clear holds between tests
    await sb.from('vendor_calendar_holds').delete().eq('vendor_profile_id', TEST_VENDOR_ID);
  });

  it('inserts first hold successfully (no existing overlap)', async () => {
    const { error } = await sb.from('vendor_calendar_holds').insert({
      vendor_profile_id: TEST_VENDOR_ID,
      hold_type: 'vendor_blocked',
      hold_range: '["2026-08-15T10:00:00+00:00","2026-08-15T12:00:00+00:00")',
    });
    expect(error).toBeNull();
  });

  it('rejects overlapping hold when capacity=1', async () => {
    // Insert first hold
    await sb.from('vendor_calendar_holds').insert({
      vendor_profile_id: TEST_VENDOR_ID,
      hold_type: 'vendor_blocked',
      hold_range: '["2026-08-15T10:00:00+00:00","2026-08-15T12:00:00+00:00")',
    });

    // Attempt overlapping hold (11:00–13:00 overlaps 10:00–12:00)
    const { error } = await sb.from('vendor_calendar_holds').insert({
      vendor_profile_id: TEST_VENDOR_ID,
      hold_type: 'vendor_blocked',
      hold_range: '["2026-08-15T11:00:00+00:00","2026-08-15T13:00:00+00:00")',
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain('calendar_capacity_exceeded');
  });

  it('accepts non-overlapping holds on the same day', async () => {
    // First hold: 10:00–12:00
    await sb.from('vendor_calendar_holds').insert({
      vendor_profile_id: TEST_VENDOR_ID,
      hold_type: 'vendor_blocked',
      hold_range: '["2026-08-15T10:00:00+00:00","2026-08-15T12:00:00+00:00")',
    });

    // Second hold: 16:00–19:00 (no overlap — back-to-back is fine with half-open bounds)
    const { error } = await sb.from('vendor_calendar_holds').insert({
      vendor_profile_id: TEST_VENDOR_ID,
      hold_type: 'vendor_blocked',
      hold_range: '["2026-08-15T16:00:00+00:00","2026-08-15T19:00:00+00:00")',
    });

    expect(error).toBeNull();
  });

  it('accepts second overlapping hold when capacity=2, rejects third', async () => {
    // Bump capacity to 2
    await sb.from('vendor_profiles').update({ concurrent_capacity: 2 }).eq('id', TEST_VENDOR_ID);

    // First hold
    const r1 = await sb.from('vendor_calendar_holds').insert({
      vendor_profile_id: TEST_VENDOR_ID,
      hold_type: 'vendor_blocked',
      hold_range: '["2026-08-15T10:00:00+00:00","2026-08-15T12:00:00+00:00")',
    });
    expect(r1.error).toBeNull();

    // Second overlapping hold — should succeed (capacity=2, overlap=1 < 2)
    const r2 = await sb.from('vendor_calendar_holds').insert({
      vendor_profile_id: TEST_VENDOR_ID,
      hold_type: 'vendor_blocked',
      hold_range: '["2026-08-15T11:00:00+00:00","2026-08-15T13:00:00+00:00")',
    });
    expect(r2.error).toBeNull();

    // Third overlapping hold — should fail (overlap=2 >= capacity=2)
    const r3 = await sb.from('vendor_calendar_holds').insert({
      vendor_profile_id: TEST_VENDOR_ID,
      hold_type: 'vendor_blocked',
      hold_range: '["2026-08-15T10:30:00+00:00","2026-08-15T11:30:00+00:00")',
    });
    expect(r3.error).not.toBeNull();
    expect(r3.error?.message).toContain('calendar_capacity_exceeded');

    // Restore capacity to 1
    await sb.from('vendor_profiles').update({ concurrent_capacity: 1 }).eq('id', TEST_VENDOR_ID);
  });
});

describe.skipIf(!hasServiceKey)('vendor_calendar_holds — status-sync trigger (integration)', () => {
  let sb: ReturnType<typeof createClient<Database>>;

  beforeAll(async () => {
    sb = createClient<Database>(SUPABASE_URL, SERVICE_KEY);
    await seedVendor(sb, 1);
    await seedBookingAndEvent(sb);
  });

  afterAll(async () => {
    await cleanup(sb);
  });

  afterEach(async () => {
    await sb.from('vendor_calendar_holds').delete().eq('vendor_profile_id', TEST_VENDOR_ID);
    // Reset booking to pending
    await sb.from('bookings').update({ status: 'pending' }).eq('id', TEST_BOOKING_ID);
  });

  it('creates holds when booking status transitions pending → accepted', async () => {
    const { error } = await sb
      .from('bookings')
      .update({ status: 'accepted' })
      .eq('id', TEST_BOOKING_ID);

    expect(error).toBeNull();

    const { data: holds } = await sb
      .from('vendor_calendar_holds')
      .select('*')
      .eq('vendor_profile_id', TEST_VENDOR_ID)
      .eq('booking_event_id', TEST_EVENT_ID);

    expect(holds).toHaveLength(1);
    expect(holds![0].hold_type).toBe('booking');
  });

  it('deletes holds when booking transitions accepted → couple_cancelled', async () => {
    // First accept to create holds
    await sb.from('bookings').update({ status: 'accepted' }).eq('id', TEST_BOOKING_ID);

    // Verify holds were created
    const { data: before } = await sb
      .from('vendor_calendar_holds')
      .select('id')
      .eq('vendor_profile_id', TEST_VENDOR_ID);
    expect(before?.length).toBeGreaterThan(0);

    // Cancel to delete holds
    const { error } = await sb
      .from('bookings')
      .update({ status: 'couple_cancelled' })
      .eq('id', TEST_BOOKING_ID);
    expect(error).toBeNull();

    const { data: after } = await sb
      .from('vendor_calendar_holds')
      .select('id')
      .eq('vendor_profile_id', TEST_VENDOR_ID);
    expect(after).toHaveLength(0);
  });
});
