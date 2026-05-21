// src/app/api/users/me/active-business/route.ts
//
// Sub-project I §3. POST endpoint called by <BusinessSwitcher> to update
// users.active_vendor_profile_id. Verifies the target profile is owned by
// the caller; rate-limited 30/min per user.
import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const gate = await checkRateLimit(
    req,
    'active-business',
    { limit: 30, window: '1 m' },
    user.id
  );
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message ?? 'rate_limit' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const vendorProfileId = (body as { vendorProfileId?: unknown }).vendorProfileId;
  if (typeof vendorProfileId !== 'string') {
    return NextResponse.json({ error: 'vendorProfileId required' }, { status: 400 });
  }

  // Ownership check
  const { data: target } = await supabase
    .from('vendor_profiles')
    .select('id, user_id')
    .eq('id', vendorProfileId)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (target.user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { error } = await supabase
    .from('users')
    .update({ active_vendor_profile_id: vendorProfileId })
    .eq('id', user.id);

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
