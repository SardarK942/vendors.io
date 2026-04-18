import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { expireStaleRequests } from '@/services/booking.service';
import { autoCompleteBookings, recognizePlatformFees } from '@/services/payment.service';

export const dynamic = 'force-dynamic';

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
}

export async function GET(request: NextRequest) {
  return POST(request);
}
