import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { hybridSearch } from '@/lib/ai/search';
import { aiSearchSchema } from '@/types';
import { withErrorBoundary } from '@/lib/api/error-boundary';

export const POST = withErrorBoundary(async (request: NextRequest) => {
  const body = await request.json();
  const parsed = aiSearchSchema.parse(body);

  const supabase = await createServerSupabaseClient();
  const { vendors, parsedQuery } = await hybridSearch(supabase, parsed.query);

  return NextResponse.json({
    data: {
      vendors,
      parsedQuery: {
        originalQuery: parsedQuery.originalQuery,
        searchText: parsedQuery.searchText,
        category: parsedQuery.category,
      },
      count: vendors.length,
    },
  });
});
