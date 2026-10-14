import { NextRequest, NextResponse } from 'next/server';
import { withErrorBoundary } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { declineOrderSchema } from '@/lib/shop/schemas';
import { declineOrder } from '@/services/orders.service';
import { assertCallerOwnsOrderVendor } from '../../_lib/vendor-ownership';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withErrorBoundary(async (request: NextRequest, { params }: Ctx) => {
  const { user, supabase } = await requireUser();
  const { id } = await params;

  await assertCallerOwnsOrderVendor(supabase, user.id, id);

  const raw: unknown = await request.json().catch(() => ({}));
  const { reason } = declineOrderSchema.parse(raw);

  const result = await declineOrder(createServiceRoleClient(), id, reason);
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status });
});
