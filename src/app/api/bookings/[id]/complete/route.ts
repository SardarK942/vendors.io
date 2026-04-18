import { NextRequest, NextResponse } from 'next/server';
import { completeBooking } from '@/services/payment.service';
import { withErrorBoundary } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';

export const POST = withErrorBoundary(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const { user, supabase } = await requireUser();

    const result = await completeBooking(supabase, id, user.id);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ data: result.data }, { status: 200 });
  }
);
