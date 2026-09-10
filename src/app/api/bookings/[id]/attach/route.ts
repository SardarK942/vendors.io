import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { linkBookingToFunction } from '@/services/events.service';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';

const attachSchema = z.object({ event_function_id: z.string().uuid() });

/**
 * POST /api/bookings/[id]/attach — link a booking to one of the couple's event
 * functions (the "book first, plan after" flow). Delegates to
 * linkBookingToFunction, which verifies ownership of both the booking and the
 * function, fills the matching vendor slot, and sets bookings.event_function_id.
 */
export const POST = withErrorBoundary(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const { user, supabase } = await requireUser();
    const { event_function_id } = attachSchema.parse(await request.json());

    const result = await linkBookingToFunction(supabase, user.id, {
      bookingId: id,
      eventFunctionId: event_function_id,
    });
    if (!result.ok) throw new HttpError(400, result.error ?? 'Could not attach booking to event');

    return NextResponse.json({ ok: true }, { status: 200 });
  }
);
