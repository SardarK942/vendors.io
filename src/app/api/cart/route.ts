import { NextRequest, NextResponse } from 'next/server';
import { withErrorBoundary } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { getCartsForBuyer } from '@/services/cart.service';

export const GET = withErrorBoundary(async (_request: NextRequest) => {
  const { user, supabase } = await requireUser();
  const result = await getCartsForBuyer(supabase, user.id);
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status });
});
