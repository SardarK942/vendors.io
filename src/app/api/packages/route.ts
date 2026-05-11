import { NextRequest, NextResponse } from 'next/server';
import { createPackage } from '@/services/packages.service';
import { createPackageSchema } from '@/types';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';

export const POST = withErrorBoundary(async (request: NextRequest) => {
  const { user, supabase } = await requireUser();

  // Find vendor profile for this user
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!vendorProfile) throw new HttpError(403, 'No vendor profile found for this user');

  const body = await request.json();
  const parsed = createPackageSchema.parse(body);

  const result = await createPackage(supabase, vendorProfile.id, parsed);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
});
