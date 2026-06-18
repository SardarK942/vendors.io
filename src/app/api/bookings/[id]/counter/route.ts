import { NextRequest, NextResponse } from 'next/server';
import { withErrorBoundary } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { coupleCounterBooking } from '@/services/booking.service';

export const POST = withErrorBoundary(
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const { user, supabase } = await requireUser();

    let body: { totalCents?: unknown; note?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
    }

    if (
      typeof body.totalCents !== 'number' ||
      !Number.isFinite(body.totalCents) ||
      !Number.isInteger(body.totalCents) ||
      body.totalCents <= 0
    ) {
      return NextResponse.json({ error: 'totalCents must be a positive integer' }, { status: 400 });
    }

    if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') {
      return NextResponse.json({ error: 'note must be a string when provided' }, { status: 400 });
    }

    const result = await coupleCounterBooking({
      supabase,
      bookingId: params.id,
      actorUserId: user.id,
      proposedTotalCents: body.totalCents,
      note: typeof body.note === 'string' ? body.note : undefined,
    });

    if (result.ok) {
      return NextResponse.json({ data: result.booking }, { status: 200 });
    }

    const statusByCode = {
      counter_cap_reached: 409,
      forbidden: 403,
      invalid_state: 400,
      not_found: 404,
    } as const;

    return NextResponse.json({ error: result.message }, { status: statusByCode[result.code] });
  }
);
