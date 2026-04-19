import { NextRequest, NextResponse } from 'next/server';
import { cancelBooking } from '@/services/payment.service';
import { cancelBookingSchema } from '@/types';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireBookingAccess, requireUser } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/rate-limit';

export const POST = withErrorBoundary(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const { user, supabase } = await requireUser();

    // Cancels contend on the atomic status-flip lock; a loop here hammers the DB
    // with no way to succeed. Tight cap.
    const gate = await checkRateLimit(
      request,
      'booking:cancel',
      { limit: 5, window: '1 m' },
      user.id
    );
    if (!gate.ok) throw new HttpError(429, gate.message!);

    const body = await request.json().catch(() => ({}));
    const parsed = cancelBookingSchema.parse(body);

    const { role } = await requireBookingAccess(supabase, id, user.id);
    const result = await cancelBooking(
      supabase,
      id,
      user.id,
      role,
      parsed.reason ?? null,
      parsed.fault ?? 'none'
    );

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ data: result.data }, { status: 200 });
  }
);
