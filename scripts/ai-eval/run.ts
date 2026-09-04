/**
 * AI search eval harness. Runs the golden query set through hybridSearch
 * against the configured Supabase DB and reports recall@5, recall@10 and MRR.
 *
 * Cache is force-disabled (Upstash env deleted before importing the search
 * module, which reads those vars at import time) so results reflect live
 * retrieval, not a warm cache.
 *
 * Usage (dev):
 *   npm run ai:eval
 * Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { recallAtK, reciprocalRank, meanReciprocalRank } from '@/lib/ai/eval-metrics';

// Disable the Upstash cache before the search module is loaded.
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

interface GoldenEntry {
  query: string;
  expectedSlugs: string[];
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  if (!process.env.OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY');

  const supabase = createClient<Database>(url, key);
  const { hybridSearch } = await import('@/lib/ai/search'); // dynamic: after cache env deleted

  const golden = JSON.parse(
    readFileSync(join(process.cwd(), 'scripts/ai-eval/golden-queries.json'), 'utf8')
  ) as GoldenEntry[];

  const rrs: number[] = [];
  const r5s: number[] = [];
  const r10s: number[] = [];
  console.log('query'.padEnd(52), 'r@5', 'r@10', 'rr');
  console.log('-'.repeat(70));
  for (const { query, expectedSlugs } of golden) {
    const { vendors } = await hybridSearch(supabase, query);
    const slugs = vendors.map((v) => v.slug ?? '').filter(Boolean);
    const r5 = recallAtK(slugs, expectedSlugs, 5);
    const r10 = recallAtK(slugs, expectedSlugs, 10);
    const rr = reciprocalRank(slugs, expectedSlugs);
    rrs.push(rr);
    r5s.push(r5);
    r10s.push(r10);
    console.log(query.slice(0, 51).padEnd(52), r5.toFixed(2), r10.toFixed(2), rr.toFixed(2));
  }
  const avg = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3);
  console.log('-'.repeat(70));
  console.log(
    `recall@5 ${avg(r5s)}   recall@10 ${avg(r10s)}   MRR ${meanReciprocalRank(rrs).toFixed(3)}   (${golden.length} queries)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
