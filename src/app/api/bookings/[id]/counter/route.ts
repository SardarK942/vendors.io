import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { coupleCounterBooking } from '@/services/booking.service';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  // Auth check first — leaks no error to unauthenticated callers.
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ code: 'unauthorized' }, { status: 401 });
  }

  // Parse body.
  let body: { totalCents?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { code: 'invalid_input', message: 'Body must be JSON' },
      { status: 400 }
    );
  }

  // Validate totalCents: must be a positive integer.
  if (
    typeof body.totalCents !== 'number' ||
    !Number.isFinite(body.totalCents) ||
    !Number.isInteger(body.totalCents) ||
    body.totalCents <= 0
  ) {
    return NextResponse.json(
      { code: 'invalid_input', message: 'totalCents must be a positive integer' },
      { status: 400 }
    );
  }

  // Validate note: string or absent.
  if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') {
    return NextResponse.json(
      { code: 'invalid_input', message: 'note must be a string when provided' },
      { status: 400 }
    );
  }

  const result = await coupleCounterBooking({
    supabase,
    bookingId: params.id,
    actorUserId: user.id,
    proposedTotalCents: body.totalCents,
    note: body.note as string | undefined,
  });

  if (result.ok) {
    return NextResponse.json({ booking: result.booking });
  }

  const statusByCode: Record<typeof result.code, number> = {
    counter_cap_reached: 409,
    forbidden: 403,
    invalid_state: 400,
    not_found: 404,
  };

  return NextResponse.json(
    { code: result.code, message: result.message },
    { status: statusByCode[result.code] }
  );
}
