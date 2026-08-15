import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { reorderPackages } from '@/services/packages.service';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { getActiveVendorProfileId } from '@/lib/vendor/active';

const schema = z.object({ ordered_ids: z.array(z.string().uuid()).min(1).max(50) });

export const PATCH = withErrorBoundary(async (request: NextRequest) => {
  const { user, supabase } = await requireUser();

  const vendorProfileId = await getActiveVendorProfileId(supabase, user.id);
  if (!vendorProfileId) throw new HttpError(403, 'No vendor profile');

  const { ordered_ids } = schema.parse(await request.json());
  const result = await reorderPackages(supabase, vendorProfileId, ordered_ids);

  if (result.error) {
    const status = result.error.code === 'INVALID_ORDER' ? 422 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ data: result.data }, { status: 200 });
});
