import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { generateEmbedding } from './embeddings';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

type VendorRow = Database['public']['Tables']['vendor_profiles']['Row'];

interface ParsedQuery {
  originalQuery: string;
  searchText: string;
  category?: string;
  budgetHint?: string;
  locationHint?: string;
}

/**
 * Use GPT-4o mini to parse a natural language search query into structured intent.
 * Cost: ~$0.00015 per 1K tokens (~$0.015 per 100-token query).
 */
export async function parseSearchQuery(query: string): Promise<ParsedQuery> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You extract search intent from wedding vendor queries. Return JSON with:
- searchText: the core search text for embedding (concise)
- category: one of photography,videography,mehndi,hair_makeup,dj,photobooth,catering,venue,decor,invitations (or null)
- budgetHint: any budget mentioned (or null)
- locationHint: any location mentioned (or null)
Respond ONLY with valid JSON, no markdown.`,
        },
        { role: 'user', content: query },
      ],
      max_tokens: 150,
      temperature: 0,
    });

    const content = response.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(content);

    return {
      originalQuery: query,
      searchText: parsed.searchText || query,
      category: parsed.category || undefined,
      budgetHint: parsed.budgetHint || undefined,
      locationHint: parsed.locationHint || undefined,
    };
  } catch {
    // Fallback: use original query if parsing fails
    return { originalQuery: query, searchText: query };
  }
}

/**
 * Semantic search using pgvector cosine similarity.
 * Primary search tier.
 */
export async function semanticSearch(
  supabase: SupabaseClient<Database>,
  query: string,
  matchCount: number = 10
): Promise<(VendorRow & { similarity: number })[]> {
  const embedding = await generateEmbedding(query);

  const { data, error } = await supabase.rpc('search_vendors_semantic', {
    query_embedding: JSON.stringify(embedding),
    match_count: matchCount,
    similarity_threshold: 0.3,
  });

  if (error) {
    console.error('[semanticSearch] Error:', error);
    return [];
  }

  return (data ?? []) as (VendorRow & { similarity: number })[];
}

/**
 * Full-text search using Postgres ts_vector.
 * Fallback when semantic results are insufficient.
 */
export async function fullTextSearch(
  supabase: SupabaseClient<Database>,
  query: string,
  matchCount: number = 20
): Promise<VendorRow[]> {
  const { data, error } = await supabase.rpc('search_vendors_fulltext', {
    search_query: query,
    match_count: matchCount,
  });

  if (error) {
    console.error('[fullTextSearch] Error:', error);
    return [];
  }

  return (data ?? []) as VendorRow[];
}

/**
 * Two-tier hybrid search:
 * 1. Semantic search (primary) via pgvector
 * 2. Full-text fallback if semantic results < 5
 * 3. Optional category filter from parsed query
 */
export async function hybridSearch(
  supabase: SupabaseClient<Database>,
  query: string
): Promise<{ vendors: VendorRow[]; parsedQuery: ParsedQuery }> {
  // Step 1: Parse the query for intent
  const parsedQuery = await parseSearchQuery(query);

  // Step 2: Semantic search
  let results = await semanticSearch(supabase, parsedQuery.searchText);

  // Step 3: Fallback to full-text if < 5 results
  if (results.length < 5) {
    const fallbackResults = await fullTextSearch(supabase, parsedQuery.searchText);
    const existingIds = new Set(results.map((r) => r.id));
    const newResults = fallbackResults.filter((r) => !existingIds.has(r.id));
    results = [...results, ...newResults.map((r) => ({ ...r, similarity: 0 }))];
  }

  // Step 4: Filter by category if parsed
  if (parsedQuery.category) {
    const filtered = results.filter((r) => r.category === parsedQuery.category);
    if (filtered.length > 0) {
      results = filtered;
    }
  }

  return { vendors: results, parsedQuery };
}
