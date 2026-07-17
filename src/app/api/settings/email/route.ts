import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { new_email?: string } | null;
  const next = body?.new_email?.trim();

  if (!next || !EMAIL_RE.test(next)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  if (next === user.email) {
    return NextResponse.json({ error: 'New email must differ from current.' }, { status: 400 });
  }

  // updateUser({email}) triggers a Supabase confirmation email to `next`.
  // Cap prevents using a hijacked session to spray confirm emails at arbitrary
  // addresses.
  const gate = await checkRateLimit(
    req,
    'settings:email',
    { limit: 3, window: '10 m' },
    user.id
  );
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message ?? 'rate_limit' }, { status: 429 });
  }

  const { error } = await supabase.auth.updateUser({ email: next });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
