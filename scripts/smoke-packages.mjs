#!/usr/bin/env node
// Schema-level smoke test for sub-project A.
// Uses the Supabase service-role client to exercise the new package + booking
// model end-to-end at the DB layer. Validates triggers, constraints, RLS-bypass
// semantics, and snapshot integrity.
//
// Run: node scripts/smoke-packages.mjs
// Requires .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
//
// Does NOT cover: auth flows, API routes (those need real sessions), Stripe
// checkout, email sends. Those are gated by a browser-based smoke.

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const RUN_ID = `smoke-a-${Date.now()}`;
const TAG = '[smoke]';
let exitCode = 0;
const createdIds = { user: [], vendor_profile: [], package: [], booking: [] };

function ok(label) {
  console.log(`✓ ${label}`);
}
function fail(label, details) {
  console.error(`✗ ${label}\n   ${details}`);
  exitCode = 1;
}

async function main() {
  console.log(`${TAG} starting (run id: ${RUN_ID})`);

  // ────────────────────────────────────────────────────────────────────────
  // Step 1: Create a vendor user + profile
  // ────────────────────────────────────────────────────────────────────────
  const vendorEmail = `vendor-${RUN_ID}@example.test`;
  const { data: vendorAuth, error: vendorAuthErr } = await supabase.auth.admin.createUser({
    email: vendorEmail,
    password: 'test-password-1234',
    email_confirm: true,
  });
  if (vendorAuthErr || !vendorAuth?.user) return fail('create vendor user', vendorAuthErr?.message);
  createdIds.user.push(vendorAuth.user.id);

  await supabase.from('users').upsert({
    id: vendorAuth.user.id,
    email: vendorEmail,
    role: 'vendor',
    full_name: 'Smoke Test Vendor',
  });

  const { data: vp, error: vpErr } = await supabase
    .from('vendor_profiles')
    .insert({
      user_id: vendorAuth.user.id,
      business_name: 'Smoke Photography',
      slug: `smoke-photography-${RUN_ID}`,
      category: 'photography',
      bio: 'Smoke test vendor',
      service_area: ['Chicago'],
      response_sla_hours: 48,
      base_city: 'Chicago',
      base_state: 'IL',
      base_address_public: false,
    })
    .select('*')
    .single();
  if (vpErr || !vp) return fail('create vendor profile', vpErr?.message);
  createdIds.vendor_profile.push(vp.id);
  ok('vendor user + profile created');

  // ────────────────────────────────────────────────────────────────────────
  // Step 2: Create a package + 2 add-ons
  // ────────────────────────────────────────────────────────────────────────
  const { data: pkg, error: pkgErr } = await supabase
    .from('packages')
    .insert({
      vendor_profile_id: vp.id,
      name: 'Wedding Day Coverage',
      description: 'Smoke test package',
      base_price_cents: 240000,
      included_items: ['8h coverage', '200+ photos'],
      max_guests: 200,
      duration_hours: 8,
      events_count: 3, // multi-day bundle
      featured_image_url: 'https://example.com/photo.jpg',
      gallery_image_urls: [],
      vendor_notes_template: 'I will arrive 30 min early.',
      location_mode: 'couple_provides',
      is_active: true,
    })
    .select('*')
    .single();
  if (pkgErr || !pkg) return fail('create package', pkgErr?.message);
  createdIds.package.push(pkg.id);

  const { data: addons, error: addonsErr } = await supabase
    .from('package_addons')
    .insert([
      { package_id: pkg.id, name: 'Drone footage', price_delta_cents: 50000, display_order: 0 },
      { package_id: pkg.id, name: 'Second shooter', price_delta_cents: 30000, display_order: 1 },
    ])
    .select('*');
  if (addonsErr || !addons || addons.length !== 2) return fail('create addons', addonsErr?.message);
  ok('package + 2 addons created');

  // ────────────────────────────────────────────────────────────────────────
  // Step 3: Create a couple user
  // ────────────────────────────────────────────────────────────────────────
  const coupleEmail = `couple-${RUN_ID}@example.test`;
  const { data: coupleAuth, error: coupleAuthErr } = await supabase.auth.admin.createUser({
    email: coupleEmail,
    password: 'test-password-1234',
    email_confirm: true,
  });
  if (coupleAuthErr || !coupleAuth?.user) return fail('create couple user', coupleAuthErr?.message);
  createdIds.user.push(coupleAuth.user.id);
  await supabase.from('users').upsert({
    id: coupleAuth.user.id,
    email: coupleEmail,
    role: 'couple',
    full_name: 'Smoke Test Couple',
  });
  ok('couple user created');

  // ────────────────────────────────────────────────────────────────────────
  // Step 4: Insert a multi-event booking with snapshots (simulating createBooking)
  // ────────────────────────────────────────────────────────────────────────
  const selectedAddons = [
    {
      addon_id: addons[0].id,
      name: addons[0].name,
      price_delta_cents: addons[0].price_delta_cents,
    },
    {
      addon_id: addons[1].id,
      name: addons[1].name,
      price_delta_cents: addons[1].price_delta_cents,
    },
  ];

  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .insert({
      couple_user_id: coupleAuth.user.id,
      vendor_profile_id: vp.id,
      package_id: pkg.id,
      package_name_snapshot: pkg.name,
      package_base_price_cents_snapshot: pkg.base_price_cents,
      selected_addons: selectedAddons,
      guest_count: 150,
      special_requests: 'Vegetarian setup',
      couple_full_name: 'Smoke Couple',
      status: 'pending',
      negotiation_round_count: 0,
      expires_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
      // Legacy columns required by NOT NULL in 00003 — set them to satisfy schema
      event_date: '2026-08-15',
      event_type: 'wedding',
    })
    .select('*')
    .single();
  if (bErr || !booking) return fail('create booking', bErr?.message);
  createdIds.booking.push(booking.id);

  // ASSERT total_price_cents trigger fired
  const expectedTotal = pkg.base_price_cents + 50000 + 30000; // 240000 + 80000 = 320000
  if (booking.total_price_cents !== expectedTotal) {
    return fail(
      `trigger total_price_cents mismatch`,
      `expected ${expectedTotal}, got ${booking.total_price_cents}`
    );
  }
  ok(`trigger computed total_price_cents = ${booking.total_price_cents} (= base + addons)`);

  // Insert 3 booking_events
  const { data: events, error: evErr } = await supabase
    .from('booking_events')
    .insert([
      {
        booking_id: booking.id,
        sequence: 1,
        event_date: '2026-08-14',
        event_start_time: '2026-08-14T16:00:00Z',
        event_end_time: '2026-08-14T22:00:00Z',
        event_type_label: 'Mehndi',
        address_line_1: '123 Devon Ave',
        city: 'Chicago',
        state: 'IL',
        postal_code: '60659',
      },
      {
        booking_id: booking.id,
        sequence: 2,
        event_date: '2026-08-15',
        event_start_time: '2026-08-15T16:00:00Z',
        event_end_time: '2026-08-15T23:00:00Z',
        event_type_label: 'Wedding Ceremony',
        location_name: 'The Drake Hotel',
        address_line_1: '140 E Walton Pl',
        city: 'Chicago',
        state: 'IL',
        postal_code: '60611',
      },
      {
        booking_id: booking.id,
        sequence: 3,
        event_date: '2026-08-16',
        event_start_time: '2026-08-16T18:00:00Z',
        event_end_time: '2026-08-17T00:00:00Z',
        event_type_label: 'Walima',
        location_name: 'The Drake Hotel',
        address_line_1: '140 E Walton Pl',
        city: 'Chicago',
        state: 'IL',
        postal_code: '60611',
      },
    ])
    .select('*');
  if (evErr || !events || events.length !== 3) return fail('create 3 booking_events', evErr?.message);
  ok(`3 booking_events inserted, sequences ${events.map((e) => e.sequence).join(',')}`);

  // ────────────────────────────────────────────────────────────────────────
  // Step 5: Test the adjustment flow — update adjustment_amount_cents, verify trigger
  // ────────────────────────────────────────────────────────────────────────
  const adjustmentDelta = 20000; // +$200 for travel
  const { data: adjBooking, error: adjErr } = await supabase
    .from('bookings')
    .update({
      status: 'adjusted_quote_sent',
      adjustment_amount_cents: adjustmentDelta,
      adjustment_reason: 'travel',
      negotiation_round_count: 1,
    })
    .eq('id', booking.id)
    .select('*')
    .single();
  if (adjErr || !adjBooking) return fail('apply adjustment', adjErr?.message);

  const expectedAfterAdj = expectedTotal + adjustmentDelta;
  if (adjBooking.total_price_cents !== expectedAfterAdj) {
    return fail(
      `trigger did not recompute on adjustment`,
      `expected ${expectedAfterAdj}, got ${adjBooking.total_price_cents}`
    );
  }
  ok(`trigger recomputed on adjustment: total_price_cents = ${adjBooking.total_price_cents}`);

  // ────────────────────────────────────────────────────────────────────────
  // Step 6: Verify check constraints
  // ────────────────────────────────────────────────────────────────────────
  // 6a: adjustment_explanation_when_other — should reject reason='other' without explanation
  const { error: otherErr } = await supabase
    .from('bookings')
    .update({ adjustment_reason: 'other', adjustment_explanation: null })
    .eq('id', booking.id);
  if (!otherErr) {
    return fail(
      'adjustment_explanation_when_other constraint',
      'expected rejection when reason=other and explanation=null'
    );
  }
  ok('check constraint: reason=other without explanation → rejected');

  // 6b: total_price_positive — try to insert a zero-priced booking
  const { error: zeroErr } = await supabase
    .from('bookings')
    .insert({
      couple_user_id: coupleAuth.user.id,
      vendor_profile_id: vp.id,
      package_id: pkg.id,
      package_name_snapshot: 'Zero',
      package_base_price_cents_snapshot: 0, // would make total = 0 + 0 + 0 = 0
      status: 'pending',
      event_date: '2026-08-15',
      event_type: 'wedding',
    });
  if (!zeroErr) {
    return fail(
      'total_price_positive constraint',
      'expected rejection on zero-priced booking, but insert succeeded'
    );
  }
  ok('check constraint: total_price_cents = 0 → rejected');

  // ────────────────────────────────────────────────────────────────────────
  // Step 7: Test snapshot integrity — modify package, verify booking unchanged
  // ────────────────────────────────────────────────────────────────────────
  await supabase
    .from('packages')
    .update({ name: 'Renamed Wedding Pack', base_price_cents: 999999 })
    .eq('id', pkg.id);

  const { data: stillBooking } = await supabase
    .from('bookings')
    .select('package_name_snapshot, package_base_price_cents_snapshot, total_price_cents')
    .eq('id', booking.id)
    .single();

  if (stillBooking?.package_name_snapshot !== 'Wedding Day Coverage') {
    return fail(
      'snapshot integrity (name)',
      `name snapshot drifted to ${stillBooking?.package_name_snapshot}`
    );
  }
  if (stillBooking?.package_base_price_cents_snapshot !== 240000) {
    return fail(
      'snapshot integrity (price)',
      `price snapshot drifted to ${stillBooking?.package_base_price_cents_snapshot}`
    );
  }
  ok('snapshot integrity: package rename/reprice did not affect existing booking');

  // ────────────────────────────────────────────────────────────────────────
  // Step 8: Verify computed view (vendor_packages_price_band)
  // ────────────────────────────────────────────────────────────────────────
  // Create a second package to test min/max
  const { data: pkg2 } = await supabase
    .from('packages')
    .insert({
      vendor_profile_id: vp.id,
      name: 'Engagement Mini',
      description: 'Smaller package',
      base_price_cents: 80000,
      included_items: ['2h coverage'],
      max_guests: 50,
      duration_hours: 2,
      events_count: 1,
      featured_image_url: 'https://example.com/eng.jpg',
      gallery_image_urls: [],
      location_mode: 'couple_provides',
      is_active: true,
    })
    .select('*')
    .single();
  if (pkg2) createdIds.package.push(pkg2.id);

  const { data: band } = await supabase
    .from('vendor_packages_price_band')
    .select('*')
    .eq('vendor_profile_id', vp.id)
    .single();

  // pkg was renamed to base_price 999999 above; pkg2 is 80000. Range should be 80000..999999.
  if (!band || band.min_price_cents !== 80000 || band.active_package_count !== 2) {
    return fail(
      'vendor_packages_price_band view',
      `expected min=80000 count=2, got ${JSON.stringify(band)}`
    );
  }
  ok(
    `vendor_packages_price_band view: min=${band.min_price_cents} max=${band.max_price_cents} count=${band.active_package_count}`
  );

  // ────────────────────────────────────────────────────────────────────────
  // Cleanup (always runs, even on failure above)
  // ────────────────────────────────────────────────────────────────────────
  console.log(`${TAG} cleanup`);
}

async function cleanup() {
  // Delete booking_events first (FK cascade should handle but be explicit)
  for (const id of createdIds.booking) {
    await supabase.from('bookings').delete().eq('id', id);
  }
  // Packages cascade addons
  for (const id of createdIds.package) {
    await supabase.from('packages').delete().eq('id', id);
  }
  for (const id of createdIds.vendor_profile) {
    await supabase.from('vendor_profiles').delete().eq('id', id);
  }
  for (const id of createdIds.user) {
    await supabase.from('users').delete().eq('id', id);
    await supabase.auth.admin.deleteUser(id);
  }
}

main()
  .catch((e) => {
    console.error('uncaught:', e);
    exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    console.log(`${TAG} done (exit ${exitCode})`);
    process.exit(exitCode);
  });
