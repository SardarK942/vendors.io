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
const TEST_EMAIL_DOMAIN = 'e2e-test.vendors.io.local';

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
      starting_price_min: 100_000,
      starting_price_max: 500_000,
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

export type SeedBookingStatus = 'pending' | 'quoted' | 'deposit_paid' | 'completed';

export interface SeedBookingOptions {
  status?: SeedBookingStatus;
  eventDaysFromNow?: number;
  quoteAmountCents?: number;
}

/**
 * Seed a booking directly via service role — skips the API state machine, so
 * tests can start from any state without driving the whole flow. Leaves enough
 * related rows for the service-layer queries to find their joins.
 */
export async function seedBooking(
  couple: TestUser,
  vendor: TestVendor,
  options: SeedBookingOptions = {}
): Promise<{ id: string }> {
  const supabase = getServiceClient();
  const { status = 'pending', eventDaysFromNow = 180, quoteAmountCents = 150_000 } = options;

  const eventDate = new Date(Date.now() + eventDaysFromNow * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const row: Record<string, unknown> = {
    couple_user_id: couple.id,
    vendor_profile_id: vendor.vendorProfileId,
    event_date: eventDate,
    event_type: 'wedding',
    guest_count: 100,
    couple_phone: '(312) 555-0100',
    couple_email: couple.email,
    status,
  };
  if (status === 'quoted' || status === 'deposit_paid' || status === 'completed') {
    row.vendor_quote_amount = quoteAmountCents;
    row.vendor_responded_at = new Date().toISOString();
  }
  if (status === 'deposit_paid' || status === 'completed') {
    row.deposit_amount = quoteAmountCents;
    row.deposit_paid_at = new Date().toISOString();
    row.couple_contact_revealed = true;
    row.stripe_payment_intent_id = `pi_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }
  if (status === 'completed') {
    row.completed_at = new Date().toISOString();
  }

  const { data, error } = await supabase.from('booking_requests').insert(row).select('id').single();
  if (error || !data) throw new Error(`seedBooking: ${error?.message}`);
  return { id: data.id };
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
