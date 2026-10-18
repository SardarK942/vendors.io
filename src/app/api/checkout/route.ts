import { NextRequest, NextResponse } from 'next/server';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { checkoutSchema } from '@/lib/shop/schemas';
import { createCheckoutSession } from '@/services/checkout.service';

export const POST = withErrorBoundary(async (request: NextRequest) => {
  const { user, supabase } = await requireUser();

  const gate = await checkRateLimit(
    request,
    'booking:deposit',
    { limit: 10, window: '10 m' },
    user.id
  );
  if (!gate.ok) throw new HttpError(429, gate.message!);

  const body = checkoutSchema.parse(await request.json());
  const result = await createCheckoutSession(supabase, createServiceRoleClient(), user.id, body);
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status });
});
