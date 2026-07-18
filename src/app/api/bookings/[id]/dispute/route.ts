import { NextRequest, NextResponse } from 'next/server';
import { disputeBooking } from '@/services/payment.service';
import { disputeBookingSchema } from '@/types';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireBookingAccess, requireUser } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/rate-limit';

export const POST = withErrorBoundary(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const { user, supabase } = await requireUser();

    const gate = await checkRateLimit(
      request,
      'booking:dispute',
      { limit: 20, window: '1 m' },
      user.id
    );
    if (!gate.ok) throw new HttpError(429, gate.message!);

    const body = await request.json().catch(() => ({}));
    const parsed = disputeBookingSchema.parse(body);

    const { role } = await requireBookingAccess(supabase, id, user.id);
    if (role !== 'couple') throw new HttpError(403, 'Only the couple can dispute this booking');

    const result = await disputeBooking(supabase, id, user.id, parsed.reason);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ data: result.data }, { status: 200 });
  }
);
