import { NextRequest, NextResponse } from 'next/server';
import { createDepositCheckout } from '@/services/payment.service';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/rate-limit';

export const POST = withErrorBoundary(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const { user, supabase } = await requireUser();

    // Guard against Stripe-Checkout-session spam from a single user.
    // 5/10min gives plenty of headroom for legit retries but blocks abuse.
    const gate = await checkRateLimit(
      request,
      'booking:deposit',
      { limit: 5, window: '10 m' },
      user.id
    );
    if (!gate.ok) throw new HttpError(429, gate.message!);

    const result = await createDepositCheckout(supabase, id, user.id);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ data: result.data }, { status: 200 });
  }
);
