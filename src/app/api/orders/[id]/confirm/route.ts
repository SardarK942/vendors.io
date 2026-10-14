import { NextRequest, NextResponse } from 'next/server';
import { withErrorBoundary } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { confirmOrder } from '@/services/orders.service';
import { notifyShopOpsAlert } from '@/services/shop-notifications.service';
import { assertCallerOwnsOrderVendor } from '../../_lib/vendor-ownership';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withErrorBoundary(async (_request: NextRequest, { params }: Ctx) => {
  const { user, supabase } = await requireUser();
  const { id } = await params;

  await assertCallerOwnsOrderVendor(supabase, user.id, id);

  const db = createServiceRoleClient();
  const result = await confirmOrder(db, id);
  if (result.status === 502) {
    try {
      await notifyShopOpsAlert(
        db,
        id,
        `Confirm failed for order ${id}: ${result.error ?? 'unknown'}`
      );
    } catch {
      // ops alert is best-effort
    }
  }
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status });
});
