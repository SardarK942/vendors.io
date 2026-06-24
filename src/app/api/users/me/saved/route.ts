// src/app/api/users/me/saved/route.ts
//
// Bucket J T11. Shortlist API — GET (list) + POST (save) for saved vendors.
// POST atomically detects whether this is the user's first-ever save.
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'auth required' }, { status: 401 });

  const { data, error } = await supabase
    .from('saved_vendors')
    .select('vendor_profile_id, saved_at')
    .eq('user_id', user.id)
    .order('saved_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'fetch failed' }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  let body: { vendor_profile_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if (!body.vendor_profile_id) {
    return NextResponse.json({ error: 'vendor_profile_id required' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'auth required' }, { status: 401 });

  // Atomic first-save detection: UPDATE only fires if first_save_at is currently NULL.
  // If user already has a first_save_at, the UPDATE matches zero rows → isFirstSave = false.
  const { data: firstSaveResult } = await supabase
    .from('users')
    .update({ first_save_at: new Date().toISOString() })
    .eq('id', user.id)
    .is('first_save_at', null)
    .select('first_save_at');

  const isFirstSave = (firstSaveResult?.length ?? 0) > 0;

  // Insert into saved_vendors. PK conflict (already saved) is idempotent — swallow it.
  const { error: insertError } = await supabase
    .from('saved_vendors')
    .insert({ user_id: user.id, vendor_profile_id: body.vendor_profile_id });

  if (insertError && !insertError.message.includes('duplicate key')) {
    return NextResponse.json({ error: 'insert failed' }, { status: 500 });
  }

  return NextResponse.json({ data: { first_save: isFirstSave } });
}
