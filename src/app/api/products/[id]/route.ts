import { NextRequest, NextResponse } from 'next/server';
import { updateProduct, deleteProduct } from '@/services/products.service';
import { updateProductSchema } from '@/types';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { getActiveVendorProfileId } from '@/lib/vendor/active';

export const PATCH = withErrorBoundary(
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const { user, supabase } = await requireUser();
    const vendorProfileId = await getActiveVendorProfileId(supabase, user.id);
    if (!vendorProfileId) throw new HttpError(403, 'No vendor profile');

    const body = await request.json();
    const parsed = updateProductSchema.parse(body);

    const result = await updateProduct(supabase, params.id, vendorProfileId, parsed);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ data: result.data }, { status: 200 });
  }
);

export const DELETE = withErrorBoundary(
  async (_request: NextRequest, { params }: { params: { id: string } }) => {
    const { user, supabase } = await requireUser();
    const vendorProfileId = await getActiveVendorProfileId(supabase, user.id);
    if (!vendorProfileId) throw new HttpError(403, 'No vendor profile');

    const result = await deleteProduct(supabase, params.id, vendorProfileId);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ data: result.data }, { status: 200 });
  }
);
