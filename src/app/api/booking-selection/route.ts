/**
 * /api/booking-selection — signed cookie selection handoff
 *
 * POST: writes {package_id, selected_addons} to a signed cookie (30-min TTL)
 * GET:  returns the current selection from cookie
 *
 * HMAC signing/verification is in src/lib/booking-selection.ts (shared with the book page).
 */
import { NextRequest, NextResponse } from 'next/server';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import {
  BOOKING_SELECTION_COOKIE_NAME,
  selectionSchema,
  encodeBookingSelectionCookie,
  decodeBookingSelectionCookie,
} from '@/lib/booking-selection';

const TTL_SECONDS = 30 * 60; // 30 minutes

export const POST = withErrorBoundary(async (request: NextRequest) => {
  const body = await request.json().catch(() => null);
  if (!body) throw new HttpError(400, 'Invalid JSON body');

  const parsed = selectionSchema.parse(body);
  const cookieValue = await encodeBookingSelectionCookie(parsed);

  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set(BOOKING_SELECTION_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: TTL_SECONDS,
    path: '/',
  });

  return response;
});

export const GET = withErrorBoundary(async (request: NextRequest) => {
  const cookieValue = request.cookies.get(BOOKING_SELECTION_COOKIE_NAME)?.value;
  if (!cookieValue) {
    return NextResponse.json({ selection: null }, { status: 200 });
  }

  const selection = await decodeBookingSelectionCookie(cookieValue);
  if (!selection) {
    return NextResponse.json({ selection: null }, { status: 200 });
  }

  return NextResponse.json({ selection }, { status: 200 });
});
