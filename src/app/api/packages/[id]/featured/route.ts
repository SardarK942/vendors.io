import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { setPackageFeatured } from '@/services/packages.service';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { getActiveVendorProfileId } from '@/lib/vendor/active';

const schema = z.object({ is_featured: z.boolean() });

export const PATCH = withErrorBoundary(
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const { user, supabase } = await requireUser();

    const vendorProfileId = await getActiveVendorProfileId(supabase, user.id);
    if (!vendorProfileId) throw new HttpError(403, 'No vendor profile');

    const { is_featured } = schema.parse(await request.json());
    const result = await setPackageFeatured(supabase, params.id, vendorProfileId, is_featured);

    if (result.error) {
      const status = result.error.code === 'NOT_FOUND_OR_FORBIDDEN' ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ data: result.data }, { status: 200 });
  }
);
