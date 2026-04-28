import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { hybridSearch } from '@/lib/ai/search';
import { aiSearchSchema } from '@/types';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { checkRateLimit } from '@/lib/rate-limit';

export const POST = withErrorBoundary(async (request: NextRequest) => {
  // AI search hits OpenAI for embeddings — tight cap per IP since anon users
  // are allowed. A loop here burns your OpenAI budget, not the user's.
  const gate = await checkRateLimit(request, 'ai:search', { limit: 30, window: '1 m' });
  if (!gate.ok) throw new HttpError(429, gate.message!);

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
