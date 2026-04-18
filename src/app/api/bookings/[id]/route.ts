import { NextRequest, NextResponse } from 'next/server';
import { getBookingById } from '@/services/booking.service';
import { withErrorBoundary } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';

export const GET = withErrorBoundary(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const { user, supabase } = await requireUser();
    const result = await getBookingById(supabase, id, user.id);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ data: result.data }, { status: 200 });
  }
);
