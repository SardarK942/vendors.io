import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { setPackageActiveState } from '@/services/packages.service';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';

const schema = z.object({ is_active: z.boolean() });

export const PATCH = withErrorBoundary(
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const { user, supabase } = await requireUser();

    const { data: vendorProfile } = await supabase
      .from('vendor_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!vendorProfile) throw new HttpError(403, 'No vendor profile');

    const { is_active } = schema.parse(await request.json());
    const result = await setPackageActiveState(supabase, params.id, vendorProfile.id, is_active);

    if (result.error) {
      const status = result.error.code === 'LAST_ACTIVE_PACKAGE' ? 409 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ data: result.data }, { status: 200 });
  }
);
