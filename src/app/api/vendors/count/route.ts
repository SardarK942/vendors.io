import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { countFilteredVendors, parseVendorFilterParams } from '@/lib/vendor-filters';

/**
 * GET /api/vendors/count?<filter-params>
 * Returns { count: number } of vendors matching the filters.
 * Used by the AllFiltersSheet's sticky "Show N vendors" footer (debounced 300ms).
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const params: Record<string, string> = {};
    url.searchParams.forEach((v, k) => {
      params[k] = v;
    });
    const filters = parseVendorFilterParams(params);

    const supabase = await createServerSupabaseClient();
    const count = await countFilteredVendors(supabase, filters);
    return NextResponse.json({ count }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error(
      '[GET /api/vendors/count] error:',
      err instanceof Error ? err.message : JSON.stringify(err)
    );
    return NextResponse.json({ count: 0, error: 'count-failed' }, { status: 500 });
  }
}
