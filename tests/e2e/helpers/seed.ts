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

export async function seedVendor(options: { chargesEnabled?: boolean } = {}): Promise<TestVendor> {
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

  const { error: vpError } = await supabase
    .from('vendor_profiles')
    .insert({
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

  const { error: vpError } = await supabase
    .from('vendor_profiles')
    .insert({
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
