// src/app/api/users/me/saved/[vendor_id]/route.ts
//
// Bucket J T11. Shortlist API — DELETE (unsave) for a specific vendor.
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ vendor_id: string }> }
) {
  const { vendor_id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'auth required' }, { status: 401 });

  const { error } = await supabase
    .from('saved_vendors')
    .delete()
    .eq('user_id', user.id)
    .eq('vendor_profile_id', vendor_id);

  if (error) return NextResponse.json({ error: 'delete failed' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
