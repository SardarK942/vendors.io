// src/app/api/users/me/businesses/route.ts
//
// Sub-project I §3. GET endpoint called by the client-side Navbar to fetch the
// caller's role + business list + active business. Drives the BusinessSwitcher
// visibility (totalCount > 1) and the "Add another business" menu-item visibility
// (role === 'vendor').
import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getActiveVendorProfile } from '@/lib/vendor/active';

export async function GET(_req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Anonymous users have nothing to switch.
    return NextResponse.json({ role: null, activeBusinessId: null, businesses: [], totalCount: 0 });
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  const role = (profile?.role as 'couple' | 'vendor' | 'admin' | null) ?? null;

  if (role !== 'vendor') {
    return NextResponse.json({ role, activeBusinessId: null, businesses: [], totalCount: 0 });
  }

  const { profile: active, totalCount } = await getActiveVendorProfile(supabase, user.id);

  let businesses: Array<{ id: string; businessName: string }> = [];
  if (totalCount > 0) {
    const { data: list } = await supabase
      .from('vendor_profiles')
      .select('id, business_name')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    businesses = (list ?? []).map((b) => ({
      id: b.id,
      businessName: b.business_name ?? 'Untitled',
    }));
  }

  return NextResponse.json({
    role,
    activeBusinessId: active?.id ?? null,
    businesses,
    totalCount,
  });
}
