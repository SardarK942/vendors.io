import { NextResponse } from 'next/server';
import { getVendorEarnings } from '@/services/payment.service';
import { withErrorBoundary } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';

export const GET = withErrorBoundary(async () => {
  const { user, supabase } = await requireUser();
  const result = await getVendorEarnings(supabase, user.id);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ data: result.data }, { status: 200 });
});
