import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { newsletterSubscribeSchema } from '@/lib/newsletter/validation';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  const parsed = newsletterSubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 });
  }

  const { email, source } = parsed.data;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from('newsletter_signups').insert({
    email,
    source,
    user_id: user?.id ?? null,
  });

  // Idempotent: treat unique-violation as success so we never leak
  // which addresses are already subscribed.
  if (error && error.code !== '23505') {
    logger.error('newsletter signup failed', error, { source, email_domain: email.split('@')[1] });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  logger.info('newsletter_signup_submitted', { source, was_duplicate: error?.code === '23505' });
  return NextResponse.json({ ok: true }, { status: 200 });
}
