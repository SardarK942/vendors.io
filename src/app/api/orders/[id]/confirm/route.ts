import { NextRequest, NextResponse } from 'next/server';
import { withErrorBoundary } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { confirmOrder } from '@/services/orders.service';
import { assertCallerOwnsOrderVendor } from '../../_lib/vendor-ownership';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withErrorBoundary(async (_request: NextRequest, { params }: Ctx) => {
  const { user, supabase } = await requireUser();
  const { id } = await params;

  await assertCallerOwnsOrderVendor(supabase, user.id, id);

  const result = await confirmOrder(createServiceRoleClient(), id);
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status });
});
