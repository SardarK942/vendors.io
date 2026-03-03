import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getVendors } from '@/services/vendor.service';
import { vendorSearchSchema } from '@/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const supabase = await createServerSupabaseClient();

  const parsed = vendorSearchSchema.safeParse({
    query: searchParams.get('query') || undefined,
    category: searchParams.get('category') || undefined,
    priceMin: searchParams.get('priceMin') ? Number(searchParams.get('priceMin')) : undefined,
    priceMax: searchParams.get('priceMax') ? Number(searchParams.get('priceMax')) : undefined,
    serviceArea: searchParams.get('serviceArea') || undefined,
    page: searchParams.get('page') ? Number(searchParams.get('page')) : 1,
    limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : 20,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid parameters', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const result = await getVendors(supabase, parsed.data);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ data: result.data }, { status: 200 });
}
