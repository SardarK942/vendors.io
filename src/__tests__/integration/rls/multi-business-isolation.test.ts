/**
 * Sub-project I §10 — multi-business isolation guard.
 *
 * Verifies that switching users.active_vendor_profile_id changes which set of
 * vendor_profile-scoped data is returned by the active-business resolver.
 *
 * This test relies on dev DB state (uses an existing vendor_profile if present,
 * otherwise seeds one). Skipped without SUPABASE_SERVICE_ROLE_KEY.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { getActiveVendorProfile } from '@/lib/vendor/active';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const skip = !SUPABASE_URL || !SERVICE_KEY;
const suite = skip ? describe.skip : describe;

suite('multi-business isolation — active_vendor_profile_id resolution', () => {
  // User id is assigned by auth.admin.createUser; vendor_profile ids are
  // stable hex UUIDs.
  let TEST_USER_ID = '';
  const TEST_EMAIL = `multi-biz-i-${Date.now().toString(36)}@test.local`;
  const TEST_VP_1 = '00000000-0000-0000-0000-000000000a02';
  const TEST_VP_2 = '00000000-0000-0000-0000-000000000a03';

  const sb = skip
    ? (null as never)
    : createClient<Database>(SUPABASE_URL, SERVICE_KEY, {
        auth: { persistSession: false },
      });

  beforeAll(async () => {
    // Create the auth.users row first (public.users.id FK → auth.users.id).
    const { data: created, error: authErr } = await sb.auth.admin.createUser({
      email: TEST_EMAIL,
      password: 'TestPassword123!',
      email_confirm: true,
      user_metadata: { full_name: 'Multi-Biz Test User', role: 'vendor' },
    });
    if (authErr || !created.user) {
      throw new Error(`failed to create auth user: ${authErr?.message ?? 'unknown'}`);
    }
    TEST_USER_ID = created.user.id;

    // The handle_new_user trigger may auto-insert a public.users row from
    // user_metadata. Upsert to ensure role is set correctly regardless.
    await sb.from('users').upsert({
      id: TEST_USER_ID,
      email: TEST_EMAIL,
      full_name: 'Multi-Biz Test User',
      role: 'vendor',
      active_vendor_profile_id: null,
    });

    const stamp = Date.now().toString(36);
    // NOTE: omit is_active + onboarding_complete because the dev DB has schema
    // drift — those columns exist on prod but not dev. The test only needs
    // user_id + active_vendor_profile_id resolution to work, which doesn't
    // depend on those fields.
    const { error: vp1Err } = await sb.from('vendor_profiles').insert({
      id: TEST_VP_1,
      user_id: TEST_USER_ID,
      business_name: 'Biz One',
      slug: `biz-one-${stamp}`,
      category: 'photography',
      service_area: ['Chicago'],
      portfolio_images: [],
    });
    if (vp1Err) throw new Error(`vp1 insert failed: ${vp1Err.message}`);

    // Brief delay so VP_2.created_at > VP_1.created_at.
    await new Promise((r) => setTimeout(r, 20));

    const { error: vp2Err } = await sb.from('vendor_profiles').insert({
      id: TEST_VP_2,
      user_id: TEST_USER_ID,
      business_name: 'Biz Two',
      slug: `biz-two-${stamp}`,
      category: 'dj',
      service_area: ['Chicago'],
      portfolio_images: [],
    });
    if (vp2Err) throw new Error(`vp2 insert failed: ${vp2Err.message}`);
  });

  afterAll(async () => {
    if (skip || !TEST_USER_ID) return;
    await sb.from('vendor_profiles').delete().eq('user_id', TEST_USER_ID);
    // auth.users CASCADE delete will remove public.users automatically.
    await sb.auth.admin.deleteUser(TEST_USER_ID);
  });

  it('returns the explicitly-set active profile + totalCount=2', async () => {
    // Set active to VP_2.
    await sb
      .from('users')
      .update({ active_vendor_profile_id: TEST_VP_2 })
      .eq('id', TEST_USER_ID);

    const result = await getActiveVendorProfile(sb, TEST_USER_ID);
    expect(result.profile?.id).toBe(TEST_VP_2);
    expect(result.totalCount).toBe(2);
  });

  it('falls back to first-by-created_at when active is NULL and count > 1', async () => {
    await sb
      .from('users')
      .update({ active_vendor_profile_id: null })
      .eq('id', TEST_USER_ID);

    const result = await getActiveVendorProfile(sb, TEST_USER_ID);
    // VP_1 was inserted first (smaller created_at), so it should win.
    expect(result.profile?.id).toBe(TEST_VP_1);
    expect(result.totalCount).toBe(2);

    // Persistence: the active pointer should have been set.
    const { data: u } = await sb
      .from('users')
      .select('active_vendor_profile_id')
      .eq('id', TEST_USER_ID)
      .single();
    expect(u?.active_vendor_profile_id).toBe(TEST_VP_1);
  });

  it('switches: changing active_vendor_profile_id swaps which profile is returned', async () => {
    await sb
      .from('users')
      .update({ active_vendor_profile_id: TEST_VP_1 })
      .eq('id', TEST_USER_ID);

    const a = await getActiveVendorProfile(sb, TEST_USER_ID);
    expect(a.profile?.id).toBe(TEST_VP_1);
    expect(a.profile?.business_name).toBe('Biz One');

    await sb
      .from('users')
      .update({ active_vendor_profile_id: TEST_VP_2 })
      .eq('id', TEST_USER_ID);

    const b = await getActiveVendorProfile(sb, TEST_USER_ID);
    expect(b.profile?.id).toBe(TEST_VP_2);
    expect(b.profile?.business_name).toBe('Biz Two');
  });
});
