/**
 * Shared HMAC helper for the booking-selection signed cookie.
 *
 * Used by:
 *  - src/app/api/booking-selection/route.ts  (sign + verify on POST/GET)
 *  - src/app/(marketplace)/vendors/[slug]/book/page.tsx  (verify on read)
 *
 * Signing key: BOOKING_SELECTION_SECRET env var (falls back to a dev secret).
 */
import { z } from 'zod';

export const BOOKING_SELECTION_COOKIE_NAME = 'booking_selection';

export const selectionSchema = z.object({
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

export type BookingSelection = z.infer<typeof selectionSchema>;

export function getBookingSelectionSecret(): string {
  return process.env.BOOKING_SELECTION_SECRET ?? 'dev-booking-selection-secret-change-in-prod';
}

export async function signPayload(payload: string, secret: string): Promise<string> {
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

export async function verifyPayload(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const expected = await signPayload(payload, secret);
  return expected === signature;
}

export async function encodeBookingSelectionCookie(selection: BookingSelection): Promise<string> {
  const payload = JSON.stringify(selection);
  const encoded = Buffer.from(payload).toString('base64url');
  const sig = await signPayload(encoded, getBookingSelectionSecret());
  return `${encoded}.${sig}`;
}

/**
 * Decodes AND verifies the HMAC signature on the cookie value.
 * Returns null if the signature is invalid or the payload can't be parsed.
 */
export async function decodeBookingSelectionCookie(
  cookie: string
): Promise<BookingSelection | null> {
  const parts = cookie.split('.');
  if (parts.length < 2) return null;
  const sig = parts.pop()!;
  const encoded = parts.join('.');
  const ok = await verifyPayload(encoded, sig, getBookingSelectionSecret());
  if (!ok) return null;
  try {
    const raw = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'));
    return selectionSchema.parse(raw);
  } catch {
    return null;
  }
}
