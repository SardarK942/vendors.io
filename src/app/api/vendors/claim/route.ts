import { NextRequest, NextResponse } from 'next/server';
import { claimVendorProfile } from '@/services/vendor.service';
import { vendorClaimSchema } from '@/types';
import { withErrorBoundary } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';

export const POST = withErrorBoundary(async (request: NextRequest) => {
  const { user, supabase } = await requireUser();

  const body = await request.json();
  const parsed = vendorClaimSchema.parse(body);

  const result = await claimVendorProfile(supabase, user.id, parsed.vendorProfileId);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ data: result.data }, { status: 200 });
});
