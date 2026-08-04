import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    current_password?: string;
    new_password?: string;
  } | null;

  const current = body?.current_password;
  const next = body?.new_password;

  if (!current || !next || next.length < 8) {
    return NextResponse.json(
      { error: 'Missing fields or new password too short.' },
      { status: 400 }
    );
  }

  if (current.length > 256 || next.length > 256) {
    return NextResponse.json({ error: 'Password too long.' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  // Every POST here re-signs-in with the current password — that's a password
  // oracle for the logged-in user. Hard cap prevents online brute force
  // via /api/settings/password even if someone hijacks a session cookie.
  const gate = await checkRateLimit(
    req,
    'settings:password',
    { limit: 5, window: '10 m' },
    user.id
  );
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message ?? 'rate_limit' }, { status: 429 });
  }

  const reauth = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current,
  });
  if (reauth.error) {
    return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });
  }

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
