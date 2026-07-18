import { NextRequest, NextResponse } from 'next/server';
import { completeBooking } from '@/services/payment.service';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/rate-limit';

export const POST = withErrorBoundary(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const { user, supabase } = await requireUser();

    const gate = await checkRateLimit(
      request,
      'booking:complete',
      { limit: 20, window: '1 m' },
      user.id
    );
    if (!gate.ok) throw new HttpError(429, gate.message!);

    const result = await completeBooking(supabase, id, user.id);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ data: result.data }, { status: 200 });
  }
);
