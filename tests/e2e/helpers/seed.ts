// Test fixture helpers: create ephemeral users + vendor profiles via the Supabase
// admin API, and clean them up after. Runs against whatever project .env.local
// points at — which is prod right now. That's intentional for MVP: we don't have
// a dev DB split yet (deferred to Phase H), and the helpers delete everything
// they create. Still: never run these against a DB you care about preserving.
//
// Usage:
//   const couple = await seedCouple();
//   await test.page.goto('/login');
//   ...
//   await cleanup(couple);

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../src/types/database.types';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Load .env.local ourselves — Playwright doesn't read it by default and we run
// outside Next's runtime.
function loadEnv() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const envPath = path.resolve(__dirname, '../../../.env.local');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();

export function getServiceClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'E2E helpers need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (check .env.local).'
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  role: 'couple' | 'vendor';
}

export interface TestVendor extends TestUser {
  role: 'vendor';
  vendorProfileId: string;
  vendorSlug: string;
}

const PASSWORD = 'E2eTest!Password123';
const TEST_EMAIL_DOMAIN = 'e2e-test.baazar.io.local';

function testEmail(prefix: string): string {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${stamp}-${rand}@${TEST_EMAIL_DOMAIN}`;
}

export async function seedCouple(): Promise<TestUser> {
  const supabase = getServiceClient();
  const email = testEmail('couple');
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'E2E Couple', role: 'couple' },
  });
  if (error || !data.user) throw new Error(`seedCouple: ${error?.message}`);
  // The handle_new_user trigger should have inserted a public.users row with
  // role='couple' from user_metadata. Double-check + backfill if not.
  await supabase.from('users').upsert({ id: data.user.id, email, role: 'couple' });
  return { id: data.user.id, email, password: PASSWORD, role: 'couple' };
}

export async function seedVendor(
  options: { chargesEnabled?: boolean; publish?: boolean } = {}
): Promise<TestVendor> {
  const supabase = getServiceClient();
  const email = testEmail('vendor');
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'E2E Vendor', role: 'vendor' },
  });
  if (error || !data.user) throw new Error(`seedVendor: ${error?.message}`);
  await supabase.from('users').upsert({ id: data.user.id, email, role: 'vendor' });

  const slug = `e2e-vendor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const { data: vp, error: vpError } = await supabase
    .from('vendor_profiles')
    .insert({
      user_id: data.user.id,
      business_name: 'E2E Test Vendor',
      slug,
      category: 'photography',
      bio: 'Seeded vendor for E2E tests.',
      service_area: ['Chicago'],
      // publish: true sets is_active + onboarding_complete so the public /vendors/[slug]
      // route resolves for non-owners (the page returns 404 for unpublished profiles
      // unless the viewer is the owner).
      ...(options.publish ? { is_active: true, onboarding_complete: true } : {}),
    })
    .select('id')
    .single();
  if (vpError || !vp) throw new Error(`seedVendor profile: ${vpError?.message}`);

  if (options.chargesEnabled) {
    await supabase.from('stripe_accounts').insert({
      vendor_profile_id: vp.id,
      stripe_account_id: `acct_e2e_${Date.now()}`,
      onboarding_complete: true,
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted_at: new Date().toISOString(),
      minimal_created_at: new Date().toISOString(),
    });
  }

  // When publish:true, also set users.onboarding_completed_at so the dashboard
  // OnboardingGate modal doesn't block the session if the vendor logs in.
  if (options.publish) {
    await supabase
      .from('users')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('id', data.user.id);
  }

  return {
    id: data.user.id,
    email,
    password: PASSWORD,
    role: 'vendor',
    vendorProfileId: vp.id,
    vendorSlug: slug,
  };
}

/**
 * Creates a vendor auth user + public.users row but NO vendor_profiles row.
 * Use this for tests that exercise the onboarding wizard from a blank-slate state.
 */
export async function seedVendorOnly(): Promise<TestUser> {
  const supabase = getServiceClient();
  const email = testEmail('vendor-no-profile');
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'E2E Vendor No Profile', role: 'vendor' },
  });
  if (error || !data.user) throw new Error(`seedVendorOnly: ${error?.message}`);
  await supabase.from('users').upsert({ id: data.user.id, email, role: 'vendor' });
  return { id: data.user.id, email, password: PASSWORD, role: 'vendor' };
}

/**
 * Seeds a vendor user + a partially-filled vendor_profiles row that mimics
 * scraper-prefilled data: basics + online + portfolio already set, location missing.
 * The wizard should skip to /setup/location on first visit.
 */
export interface SeedVendorWithPartialProfileOptions {
  businessName?: string;
  category?: string;
}

export interface TestVendorPartial extends TestUser {
  role: 'vendor';
  vendorSlug: string;
}

export async function seedVendorWithPartialProfile(
  options: SeedVendorWithPartialProfileOptions = {}
): Promise<TestVendorPartial> {
  const supabase = getServiceClient();
  const email = testEmail('vendor-partial');
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'E2E Vendor Partial', role: 'vendor' },
  });
  if (error || !data.user) throw new Error(`seedVendorWithPartialProfile: ${error?.message}`);
  await supabase.from('users').upsert({ id: data.user.id, email, role: 'vendor' });

  const slug = `e2e-partial-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const businessName = options.businessName ?? 'E2E Partial Vendor';
  const category = options.category ?? 'mehndi';

  const { error: vpError } = await supabase.from('vendor_profiles').insert({
    user_id: data.user.id,
    business_name: businessName,
    slug,
    category,
    bio: 'We bring intricate, story-rich henna to weddings across the Midwest. Two artists, ten years of bridal experience.',
    instagram_handle: 'e2e_partial_henna',
    portfolio_images: ['https://utfs.io/f/e2e-fake-img.jpg'],
    onboarding_complete: false,
    is_active: false,
  });
  if (vpError) throw new Error(`seedVendorWithPartialProfile profile: ${vpError.message}`);

  return {
    id: data.user.id,
    email,
    password: PASSWORD,
    role: 'vendor',
    vendorSlug: slug,
  };
}

/**
 * Seeds a vendor user + a vendor_profiles row with all required fields set
 * but onboarding_complete = false. Used to test marketplace invisibility.
 */
export interface TestVendorUnpublished extends TestUser {
  role: 'vendor';
  vendorSlug: string;
}

export async function seedVendorUnpublished(): Promise<TestVendorUnpublished> {
  const supabase = getServiceClient();
  const email = testEmail('vendor-unpublished');
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'E2E Unpublished Vendor', role: 'vendor' },
  });
  if (error || !data.user) throw new Error(`seedVendorUnpublished: ${error?.message}`);
  await supabase.from('users').upsert({ id: data.user.id, email, role: 'vendor' });

  const slug = `e2e-unpublished-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  const { error: vpError } = await supabase.from('vendor_profiles').insert({
    user_id: data.user.id,
    business_name: 'E2E Unpublished Vendor Biz',
    slug,
    category: 'mehndi',
    bio: 'We bring intricate, story-rich henna to weddings across the Midwest. Two artists, ten years of bridal experience.',
    base_address_line_1: '123 Test St',
    base_city: 'Chicago',
    base_state: 'IL',
    base_postal_code: '60601',
    base_google_place_id: 'ChIJe2eTestPlaceId',
    base_address_public: false,
    instagram_handle: 'e2e_unpublished_henna',
    portfolio_images: ['https://utfs.io/f/e2e-fake-img.jpg'],
    onboarding_complete: false,
    is_active: false,
  });
  if (vpError) throw new Error(`seedVendorUnpublished profile: ${vpError.message}`);

  return {
    id: data.user.id,
    email,
    password: PASSWORD,
    role: 'vendor',
    vendorSlug: slug,
  };
}

export interface SeedPackageOptions {
  basePriceCents?: number;
  eventsCount?: number;
  addons?: Array<{ name: string; priceDeltaCents: number }>;
  withStripeAccount?: boolean; // if true, also create a fake stripe_account row
}

export interface SeededPackage {
  id: string;
  vendorProfileId: string;
  basePriceCents: number;
  addons: Array<{ id: string; name: string; price_delta_cents: number }>;
}

/** Seed a package + add-ons directly under a vendor. Bypasses the UI/API. */
export async function seedPackage(
  vendor: TestVendor,
  options: SeedPackageOptions = {}
): Promise<SeededPackage> {
  const supabase = getServiceClient();
  const basePriceCents = options.basePriceCents ?? 150_000;
  const eventsCount = options.eventsCount ?? 1;

  const { data: pkg, error: pkgErr } = await supabase
    .from('packages')
    .insert({
      vendor_profile_id: vendor.vendorProfileId,
      name: 'E2E Package',
      description: 'Seeded for E2E tests',
      base_price_cents: basePriceCents,
      included_items: ['Coverage', 'Photos'],
      max_guests: 200,
      duration_hours: 8,
      events_count: eventsCount,
      featured_image_url: 'https://utfs.io/f/e2e-fake-img',
      gallery_image_urls: [],
      location_mode: 'couple_provides',
      is_active: true,
    })
    .select('id')
    .single();
  if (pkgErr || !pkg) throw new Error(`seedPackage: ${pkgErr?.message}`);

  let addons: SeededPackage['addons'] = [];
  if (options.addons?.length) {
    const rows = options.addons.map((a, i) => ({
      package_id: pkg.id,
      name: a.name,
      price_delta_cents: a.priceDeltaCents,
      display_order: i,
    }));
    const { data, error } = await supabase
      .from('package_addons')
      .insert(rows)
      .select('id, name, price_delta_cents');
    if (error) throw new Error(`seedPackage addons: ${error.message}`);
    addons = data ?? [];
  }

  if (options.withStripeAccount) {
    // Idempotent — seedVendor({chargesEnabled:true}) already inserts one.
    await supabase.from('stripe_accounts').upsert(
      {
        vendor_profile_id: vendor.vendorProfileId,
        stripe_account_id: `acct_e2e_${Date.now()}`,
        onboarding_complete: true,
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted_at: new Date().toISOString(),
        minimal_created_at: new Date().toISOString(),
      },
      { onConflict: 'vendor_profile_id' }
    );
  }

  return { id: pkg.id, vendorProfileId: vendor.vendorProfileId, basePriceCents, addons };
}

/**
 * Seeds a vendor with a fully-published profile (is_active=true, onboarding_complete=true)
 * and a specified concurrent_capacity. Used by G6 calendar e2e tests where the
 * availability endpoint requires is_active+onboarding_complete, and capacity must be
 * set at seed time to control the DB trigger behaviour.
 */
export async function seedVendorWithCapacity(capacity: number): Promise<TestVendor> {
  const supabase = getServiceClient();
  const email = testEmail('vendor-cap');
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'E2E Cap Vendor', role: 'vendor' },
  });
  if (error || !data.user) throw new Error(`seedVendorWithCapacity: ${error?.message}`);
  await supabase.from('users').upsert({ id: data.user.id, email, role: 'vendor' });

  const slug = `e2e-cap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const { data: vp, error: vpError } = await supabase
    .from('vendor_profiles')
    .insert({
      user_id: data.user.id,
      business_name: 'E2E Capacity Vendor',
      slug,
      category: 'photography',
      bio: 'Seeded for G6 calendar capacity e2e tests.',
      service_area: ['Chicago'],
      is_active: true,
      onboarding_complete: true,
      concurrent_capacity: capacity,
    })
    .select('id')
    .single();
  if (vpError || !vp) throw new Error(`seedVendorWithCapacity profile: ${vpError?.message}`);

  return {
    id: data.user.id,
    email,
    password: PASSWORD,
    role: 'vendor',
    vendorProfileId: vp.id,
    vendorSlug: slug,
  };
}

/**
 * Seeds a pending booking row + booking_events row directly via service-role,
 * bypassing the /api/bookings POST endpoint (which runs the capacity pre-check).
 *
 * Use this when you need to create multiple pending bookings for the same time
 * slot to test the accept-time trigger atomicity (Tests 2 + 3).
 */
export async function seedPendingBooking(
  vendor: TestVendor,
  couple: TestUser,
  pkg: SeededPackage,
  opts: {
    eventDate: string; // 'YYYY-MM-DD'
    startTime: string; // full ISO datetime, e.g. '2026-08-15T10:00:00Z'
    endTime: string; // full ISO datetime
    eventTypeLabel?: string;
  }
): Promise<{ bookingId: string; bookingEventId: string }> {
  const supabase = getServiceClient();

  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .insert({
      couple_user_id: couple.id,
      vendor_profile_id: vendor.vendorProfileId,
      package_id: pkg.id,
      package_name_snapshot: 'E2E Package',
      package_base_price_cents_snapshot: pkg.basePriceCents,
      selected_addons: [],
      guest_count: 100,
      couple_full_name: 'E2E Couple',
      couple_contact_phone: '(312) 555-0100',
      status: 'pending',
      expires_at: expiresAt,
      negotiation_round_count: 0,
    })
    .select('id')
    .single();
  if (bErr || !booking) throw new Error(`seedPendingBooking booking: ${bErr?.message}`);

  const { data: evt, error: evtErr } = await supabase
    .from('booking_events')
    .insert({
      booking_id: booking.id,
      vendor_profile_id: vendor.vendorProfileId,
      sequence: 1,
      event_date: opts.eventDate,
      event_start_time: opts.startTime,
      event_end_time: opts.endTime,
      event_type_label: opts.eventTypeLabel ?? 'Wedding Ceremony',
      address_line_1: '140 E Walton Pl',
      city: 'Chicago',
      state: 'IL',
      postal_code: '60611',
      location_overridden: false,
    })
    .select('id')
    .single();
  if (evtErr || !evt) throw new Error(`seedPendingBooking event: ${evtErr?.message}`);

  return { bookingId: booking.id, bookingEventId: evt.id };
}

/**
 * Seeds a vendor with a fully-published profile (is_active=true, onboarding_complete=true)
 * and payment_mode='cash'. Used by C5 cash-vendor e2e tests.
 * Signature mirrors seedVendorWithCapacity so callers can reuse seedPackage etc.
 */
export async function seedCashVendor(opts?: { businessName?: string }): Promise<TestVendor> {
  const supabase = getServiceClient();
  const email = testEmail('vendor-cash');
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'E2E Cash Vendor', role: 'vendor' },
  });
  if (error || !data.user) throw new Error(`seedCashVendor: ${error?.message}`);
  await supabase.from('users').upsert({ id: data.user.id, email, role: 'vendor' });

  const slug = `e2e-cash-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const businessName = opts?.businessName ?? 'E2E Cash Vendor Biz';
  const { data: vp, error: vpError } = await supabase
    .from('vendor_profiles')
    .insert({
      user_id: data.user.id,
      business_name: businessName,
      slug,
      category: 'photography',
      bio: 'Seeded cash vendor for C5 e2e tests.',
      service_area: ['Chicago'],
      is_active: true,
      onboarding_complete: true,
      concurrent_capacity: 1,
      payment_mode: 'cash',
    })
    .select('id')
    .single();
  if (vpError || !vp) throw new Error(`seedCashVendor profile: ${vpError?.message}`);

  return {
    id: data.user.id,
    email,
    password: PASSWORD,
    role: 'vendor',
    vendorProfileId: vp.id,
    vendorSlug: slug,
  };
}

/** Delete a seeded user. ON DELETE CASCADE cleans up vendor_profiles, bookings, etc. */
export async function cleanup(...users: (TestUser | null | undefined)[]): Promise<void> {
  const supabase = getServiceClient();
  for (const u of users) {
    if (!u) continue;
    try {
      await supabase.auth.admin.deleteUser(u.id);
    } catch (err) {
      console.warn(`cleanup: failed to delete ${u.email}`, err);
    }
  }
}
