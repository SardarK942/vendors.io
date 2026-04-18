import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { expireStaleRequests } from '@/services/booking.service';
import { autoCompleteBookings, recognizePlatformFees } from '@/services/payment.service';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';

export const dynamic = 'force-dynamic';

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}

export const POST = withErrorBoundary(async (request: NextRequest) => {
  if (!authorized(request)) throw new HttpError(401, 'Unauthorized');

  const supabase = createServiceRoleClient();

  const [expired, recognized, completed] = await Promise.all([
    expireStaleRequests(supabase),
    recognizePlatformFees(supabase),
    autoCompleteBookings(supabase),
  ]);

  return NextResponse.json(
    {
      ok: true,
      ran_at: new Date().toISOString(),
      expired_bookings: expired,
      recognized_transactions: recognized.recognized,
      auto_completed_bookings: completed.completed,
    },
    { status: 200 }
  );
});

export const GET = POST;
