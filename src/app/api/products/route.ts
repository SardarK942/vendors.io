import { NextRequest, NextResponse } from 'next/server';
import { createProduct } from '@/services/products.service';
import { createProductSchema } from '@/types';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { getActiveVendorProfileId } from '@/lib/vendor/active';

export const POST = withErrorBoundary(async (request: NextRequest) => {
  const { user, supabase } = await requireUser();

  const vendorProfileId = await getActiveVendorProfileId(supabase, user.id);
  if (!vendorProfileId) throw new HttpError(403, 'No vendor profile found for this user');

  const body = await request.json();
  const parsed = createProductSchema.parse(body);

  const result = await createProduct(supabase, vendorProfileId, parsed);

  if (result.error) {
    // Surface the service status verbatim (403 for the bridal_wear gate, etc.).
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
});
