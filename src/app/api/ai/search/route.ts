import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { hybridSearch } from '@/lib/ai/search';
import { aiSearchSchema } from '@/types';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = aiSearchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabaseClient();
  const { vendors, parsedQuery } = await hybridSearch(supabase, parsed.data.query);

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
}
