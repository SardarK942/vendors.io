/**
 * Cloudflare Turnstile server-side verification.
 *
 * Dormant until `TURNSTILE_SECRET_KEY` is set — without it, `verifyTurnstileToken`
 * returns `{ ok: true, dormant: true }`. Once the env var lands, absent or invalid
 * tokens are rejected with `{ ok: false }`.
 *
 * Same fail-open-on-outage philosophy as `src/lib/rate-limit.ts`: if Cloudflare
 * is unreachable, we log and allow rather than take the site down over their
 * outage.
 *
 * Usage on a route:
 *   const gate = await verifyTurnstileToken(body.turnstile_token, request);
 *   if (!gate.ok) return NextResponse.json({ error: 'bot_check_failed' }, { status: 400 });
 */

const CLOUDFLARE_ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileVerifyResult {
  ok: boolean;
  dormant?: boolean;
  errorCodes?: string[];
}

interface RequestWithHeaders {
  headers: {
    get: (name: string) => string | null;
  };
}

export async function verifyTurnstileToken(
  token: string | null | undefined,
  request?: RequestWithHeaders
): Promise<TurnstileVerifyResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, dormant: true };

  if (!token) return { ok: false, errorCodes: ['missing-input-response'] };

  const remoteIp =
    request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request?.headers.get('x-real-ip') ||
    undefined;

  const form = new URLSearchParams();
  form.set('secret', secret);
  form.set('response', token);
  if (remoteIp) form.set('remoteip', remoteIp);

  try {
    const res = await fetch(CLOUDFLARE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if (!res.ok) {
      console.error('[turnstile] siteverify http error', res.status);
      return { ok: true }; // fail-open on Cloudflare outage
    }
    const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (data.success) return { ok: true };
    return { ok: false, errorCodes: data['error-codes'] ?? [] };
  } catch (err) {
    console.error('[turnstile] siteverify failed', err);
    return { ok: true }; // fail-open on network outage
  }
}

/**
 * Client-side helper: is Turnstile configured on this deploy? Used to decide
 * whether to render the widget at all — when unset, forms just submit without
 * a token and the server accepts it (dormant mode).
 */
export function turnstileSiteKey(): string | null {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null;
}
