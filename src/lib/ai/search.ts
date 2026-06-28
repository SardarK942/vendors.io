import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { generateEmbedding } from './embeddings';
import { getCached, setCached } from './search-cache';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

type VendorRow = Database['public']['Tables']['vendor_profiles']['Row'];

export interface ParsedQuery {
  originalQuery: string;
  searchText: string;
  category?: string;
  budgetHint?: string;
  /** Extracted budget in cents (parsed from budgetHint), undefined if unparseable. */
  budgetCents?: number;
  locationHint?: string;
}

/**
 * Extract a cents value from a free-form budget string. Handles "$800",
 * "1500", "$2k", "under 2000", etc. Returns undefined when unparseable.
 */
function parseBudgetCents(hint: string | undefined): number | undefined {
  if (!hint) return undefined;
  const cleaned = hint.toLowerCase().replace(/[$,]/g, '').trim();
  const m = cleaned.match(/(\d+(?:\.\d+)?)\s*(k)?/);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const dollars = m[2] === 'k' ? n * 1000 : n;
  return Math.round(dollars * 100);
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
- category: one of photography,videography,mehndi,hair_makeup,dj,photobooth,catering,venue,decor,invitations,bridal_wear,live_music,carts (or null)
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

    const budgetHint: string | undefined = parsed.budgetHint || undefined;

    return {
      originalQuery: query,
      searchText: parsed.searchText || query,
      category: parsed.category || undefined,
      budgetHint,
      budgetCents: parseBudgetCents(budgetHint),
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
  matchCount: number = 20
): Promise<(VendorRow & { similarity: number })[]> {
  const embedding = await generateEmbedding(query);

  // Threshold = 0.15. Short user queries (one or two words) typically cosine at
  // ~0.15-0.25 against vendor embeddings that encode (business_name | category |
  // bio) — even when topically perfect. Doc-to-doc same-category sits at ~0.6,
  // so 0.15 is a safe floor for "topically related". Tune up if recall is noisy.
  const { data, error } = await supabase.rpc('search_vendors_semantic', {
    query_embedding: JSON.stringify(embedding),
    match_count: matchCount,
    similarity_threshold: 0.15,
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
 * 3. Parsed-query hints (category, location, budget) as **soft** filters —
 *    only applied if they shrink the set to ≥1, so the user always sees
 *    something rather than an empty page when the parser overconstrains.
 */
export async function hybridSearch(
  supabase: SupabaseClient<Database>,
  query: string
): Promise<{ vendors: VendorRow[]; parsedQuery: ParsedQuery }> {
  // Cache hit short-circuits OpenAI + pgvector entirely. Dormant when Upstash
  // env vars are unset.
  const cached = await getCached<{ vendors: VendorRow[]; parsedQuery: ParsedQuery }>(query);
  if (cached) return cached;

  const parsedQuery = await parseSearchQuery(query);

  let results = await semanticSearch(supabase, parsedQuery.searchText);

  if (results.length < 5) {
    const fallbackResults = await fullTextSearch(supabase, parsedQuery.searchText);
    const existingIds = new Set(results.map((r) => r.id));
    const newResults = fallbackResults.filter((r) => !existingIds.has(r.id));
    results = [...results, ...newResults.map((r) => ({ ...r, similarity: 0 }))];
  }

  if (parsedQuery.category) {
    const filtered = results.filter((r) => r.category === parsedQuery.category);
    if (filtered.length > 0) results = filtered;
  }

  if (parsedQuery.locationHint) {
    const hint = parsedQuery.locationHint.toLowerCase();
    const filtered = results.filter((r) => {
      const city = (r.base_city ?? '').toLowerCase();
      if (city && (city.includes(hint) || hint.includes(city))) return true;
      const areas = (r.service_area ?? []) as string[];
      return areas.some((a) => a.toLowerCase().includes(hint));
    });
    if (filtered.length > 0) results = filtered;
  }

  // Budget hint is parsed (and exposed via parsedQuery) but not applied here —
  // vendor_profiles has no `starting_price_cents` column. The page-level merge
  // joins vendor_packages_price_band; budget filtering can layer in there.

  const out = { vendors: results, parsedQuery };
  // Cache only non-empty results — we want a new attempt next time if the
  // first try had bad parser luck.
  if (results.length > 0) await setCached(query, out);
  return out;
}
