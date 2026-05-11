/**
 * /api/booking-selection — signed cookie selection handoff
 *
 * POST: writes {package_id, selected_addons} to a signed cookie (30-min TTL)
 * GET:  returns the current selection from cookie
 *
 * Uses HMAC-SHA256 via Web Crypto API (built-in, no extra dep).
 * Signing key: BOOKING_SELECTION_SECRET env var (falls back to a dev secret).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';

const COOKIE_NAME = 'booking_selection';
const TTL_SECONDS = 30 * 60; // 30 minutes

const selectionSchema = z.object({
  package_id: z.string().uuid(),
  selected_addons: z
    .array(
      z.object({
        addon_id: z.string().uuid(),
        name: z.string().min(1),
        price_delta_cents: z.number().int(),
      })
    )
    .default([]),
});

type Selection = z.infer<typeof selectionSchema>;

function getSecret(): string {
  return process.env.BOOKING_SELECTION_SECRET ?? 'dev-booking-selection-secret-change-in-prod';
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Buffer.from(sig).toString('base64url');
}

async function verify(payload: string, signature: string, secret: string): Promise<boolean> {
  const expected = await sign(payload, secret);
  return expected === signature;
}

async function encodeCookie(selection: Selection): Promise<string> {
  const payload = JSON.stringify(selection);
  const encoded = Buffer.from(payload).toString('base64url');
  const sig = await sign(encoded, getSecret());
  return `${encoded}.${sig}`;
}

async function decodeCookie(cookie: string): Promise<Selection | null> {
  const parts = cookie.split('.');
  if (parts.length < 2) return null;
  const sig = parts.pop()!;
  const encoded = parts.join('.');
  const ok = await verify(encoded, sig, getSecret());
  if (!ok) return null;
  try {
    const raw = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'));
    return selectionSchema.parse(raw);
  } catch {
    return null;
  }
}

export const POST = withErrorBoundary(async (request: NextRequest) => {
  const body = await request.json().catch(() => null);
  if (!body) throw new HttpError(400, 'Invalid JSON body');

  const parsed = selectionSchema.parse(body);
  const cookieValue = await encodeCookie(parsed);

  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set(COOKIE_NAME, cookieValue, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: TTL_SECONDS,
    path: '/',
  });

  return response;
});

export const GET = withErrorBoundary(async (request: NextRequest) => {
  const cookieValue = request.cookies.get(COOKIE_NAME)?.value;
  if (!cookieValue) {
    return NextResponse.json({ selection: null }, { status: 200 });
  }

  const selection = await decodeCookie(cookieValue);
  if (!selection) {
    return NextResponse.json({ selection: null }, { status: 200 });
  }

  return NextResponse.json({ selection }, { status: 200 });
});
