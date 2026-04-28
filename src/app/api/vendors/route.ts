import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getVendors } from '@/services/vendor.service';
import { vendorSearchSchema } from '@/types';
import { withErrorBoundary } from '@/lib/api/error-boundary';

export const GET = withErrorBoundary(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const supabase = await createServerSupabaseClient();

  const parsed = vendorSearchSchema.parse({
    query: searchParams.get('query') || undefined,
    category: searchParams.get('category') || undefined,
    priceMin: searchParams.get('priceMin') ? Number(searchParams.get('priceMin')) : undefined,
    priceMax: searchParams.get('priceMax') ? Number(searchParams.get('priceMax')) : undefined,
    serviceArea: searchParams.get('serviceArea') || undefined,
    page: searchParams.get('page') ? Number(searchParams.get('page')) : 1,
    limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : 20,
  });

  const result = await getVendors(supabase, parsed);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ data: result.data }, { status: 200 });
});
