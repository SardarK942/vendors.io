import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

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

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
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
