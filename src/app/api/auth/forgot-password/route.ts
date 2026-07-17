import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// Only accept redirect URLs on our own origin to avoid open-redirect abuse.
const REDIRECT_ALLOWED_HOSTS = ['baazar.io', 'www.baazar.io', 'localhost'];

const bodySchema = z.object({
  email: z.string().email().max(254),
  redirect_to: z.string().url().max(2048),
  turnstile_token: z.string().min(1).max(2048).nullish(),
});

/**
 * Wraps `supabase.auth.resetPasswordForEmail`. Previously called client-side,
 * which meant zero throttling and a free email-amplifier against any address.
 *
 * Two independent gates: IP-keyed (blunts pattern where attacker rotates
 * target emails from one IP) + email-hash-keyed (blunts pattern where
 * attacker rotates IPs to spam one address).
 *
 * Always returns 200 for both success and known-address-not-found paths — we
 * never leak whether an email is registered.
 */
export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
  }

  const { email, redirect_to, turnstile_token } = parsed.data;
  const normalisedEmail = email.trim().toLowerCase();
  const emailHash = createHash('sha256').update(normalisedEmail).digest('hex').slice(0, 32);

  const ipGate = await checkRateLimit(req, 'auth:forgot:ip', { limit: 5, window: '1 h' });
  if (!ipGate.ok) {
    return NextResponse.json({ ok: false, error: ipGate.message ?? 'rate_limit' }, { status: 429 });
  }
  const emailGate = await checkRateLimit(
    req,
    'auth:forgot:email',
    { limit: 3, window: '1 h' },
    emailHash
  );
  if (!emailGate.ok) {
    return NextResponse.json(
      { ok: false, error: emailGate.message ?? 'rate_limit' },
      { status: 429 }
    );
  }

  const turnstile = await verifyTurnstileToken(turnstile_token, req);
  if (!turnstile.ok) {
    return NextResponse.json({ ok: false, error: 'bot_check_failed' }, { status: 400 });
  }

  // Only allow redirects back to our own origins — closes off open-redirect.
  let redirectHost: string;
  try {
    redirectHost = new URL(redirect_to).hostname;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_redirect' }, { status: 400 });
  }
  if (!REDIRECT_ALLOWED_HOSTS.includes(redirectHost)) {
    return NextResponse.json({ ok: false, error: 'invalid_redirect' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(normalisedEmail, {
    redirectTo: redirect_to,
  });

  if (error) {
    // Log server-side but never leak to the client — some Supabase errors
    // (rate-limit hits, non-existent addresses) would fingerprint the account.
    logger.info('forgot_password_supabase_err', {
      email_hash: emailHash,
      message: error.message,
    });
  }

  logger.info('forgot_password_submitted', { email_hash: emailHash });
  return NextResponse.json({ ok: true });
}
