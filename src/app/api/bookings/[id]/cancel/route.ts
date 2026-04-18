import { NextRequest, NextResponse } from 'next/server';
import { cancelBooking } from '@/services/payment.service';
import { cancelBookingSchema } from '@/types';
import { withErrorBoundary } from '@/lib/api/error-boundary';
import { requireBookingAccess, requireUser } from '@/lib/api/auth';

export const POST = withErrorBoundary(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const { user, supabase } = await requireUser();

    const body = await request.json().catch(() => ({}));
    const parsed = cancelBookingSchema.parse(body);

    const { role } = await requireBookingAccess(supabase, id, user.id);
    const result = await cancelBooking(supabase, id, user.id, role, parsed.reason ?? null);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ data: result.data }, { status: 200 });
  }
);
