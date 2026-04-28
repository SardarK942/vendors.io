import { NextRequest, NextResponse } from 'next/server';
import { initiatePayout } from '@/services/payment.service';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/rate-limit';

export const POST = withErrorBoundary(async (request: NextRequest) => {
  const { user, supabase } = await requireUser();

  // Withdraw calls Stripe.transfers.create per transaction; a loop here can
  // trip Stripe's own rate limits and lock out legitimate payouts.
  const gate = await checkRateLimit(request, 'withdraw', { limit: 3, window: '1 m' }, user.id);
  if (!gate.ok) throw new HttpError(429, gate.message!);

  const result = await initiatePayout(supabase, user.id);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ data: result.data }, { status: 200 });
});
