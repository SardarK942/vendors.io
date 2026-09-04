/**
 * Pure ranking-quality metrics for the AI search eval harness.
 * `retrievedIds` is the ordered result list; `relevantIds` is the golden set
 * of ids that *should* surface for a query. Ids are matched by identity, so
 * pass the same identifier space for both (this repo uses vendor slugs).
 */

/** Fraction of relevant ids that appear in the top-k retrieved ids. */
export function recallAtK(retrievedIds: string[], relevantIds: string[], k: number): number {
  if (relevantIds.length === 0) return 0;
  const topK = new Set(retrievedIds.slice(0, k));
  const hits = relevantIds.filter((id) => topK.has(id)).length;
  return hits / relevantIds.length;
}

/** 1 / (1-based rank of the first relevant hit), or 0 if none appear. */
export function reciprocalRank(retrievedIds: string[], relevantIds: string[]): number {
  const relevant = new Set(relevantIds);
  for (let i = 0; i < retrievedIds.length; i++) {
    if (relevant.has(retrievedIds[i])) return 1 / (i + 1);
  }
  return 0;
}

/** Mean of per-query reciprocal ranks. */
export function meanReciprocalRank(reciprocalRanks: number[]): number {
  if (reciprocalRanks.length === 0) return 0;
  return reciprocalRanks.reduce((sum, rr) => sum + rr, 0) / reciprocalRanks.length;
}
