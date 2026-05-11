import { NextRequest, NextResponse } from 'next/server';
import { updatePackage, hardDeletePackage, deactivatePackage } from '@/services/packages.service';
import { updatePackageSchema } from '@/types';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';

async function resolveVendorProfileId(
  supabase: Awaited<ReturnType<typeof requireUser>>['supabase'],
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('vendor_profiles')
    .select('id')
    .eq('user_id', userId)
    .single();
  return data?.id ?? null;
}

export const PATCH = withErrorBoundary(
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const { user, supabase } = await requireUser();
    const vendorProfileId = await resolveVendorProfileId(supabase, user.id);
    if (!vendorProfileId) throw new HttpError(403, 'No vendor profile');

    const body = await request.json();
    const parsed = updatePackageSchema.parse(body);

    const result = await updatePackage(supabase, params.id, vendorProfileId, parsed);
    if (result.error) {
      const status = result.error.code === 'NOT_FOUND_OR_FORBIDDEN' ? 403 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ data: result.data }, { status: 200 });
  }
);

export const DELETE = withErrorBoundary(
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const { user, supabase } = await requireUser();
    const vendorProfileId = await resolveVendorProfileId(supabase, user.id);
    if (!vendorProfileId) throw new HttpError(403, 'No vendor profile');

    const url = new URL(request.url);
    const hard = url.searchParams.get('hard') === 'true';

    const result = hard
      ? await hardDeletePackage(supabase, params.id, vendorProfileId)
      : await deactivatePackage(supabase, params.id, vendorProfileId);

    if (result.error) {
      const status =
        result.error.code === 'LAST_ACTIVE_PACKAGE' ||
        result.error.code === 'ACTIVE_BOOKINGS_EXIST'
          ? 409
          : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ data: result.data }, { status: 200 });
  }
);
