import { describe, it, expect } from 'vitest';
import { recallAtK, reciprocalRank, meanReciprocalRank } from '@/lib/ai/eval-metrics';

describe('recallAtK', () => {
  it('counts relevant ids found within the top k', () => {
    // relevant = [a, c]; top-3 retrieved = [a, x, c] → both found → 1.0
    expect(recallAtK(['a', 'x', 'c', 'd'], ['a', 'c'], 3)).toBe(1);
  });

  it('ignores relevant ids that fall outside k', () => {
    // relevant = [a, c]; top-2 = [a, x] → only a found → 0.5
    expect(recallAtK(['a', 'x', 'c'], ['a', 'c'], 2)).toBe(0.5);
  });

  it('returns 0 when there are no relevant ids (avoids divide-by-zero)', () => {
    expect(recallAtK(['a', 'b'], [], 5)).toBe(0);
  });
});

describe('reciprocalRank', () => {
  it('is 1 divided by the 1-based rank of the first relevant hit', () => {
    // first relevant (c) is at index 2 → rank 3 → 1/3
    expect(reciprocalRank(['a', 'b', 'c'], ['c'])).toBeCloseTo(1 / 3);
  });

  it('is 0 when no relevant id appears', () => {
    expect(reciprocalRank(['a', 'b'], ['z'])).toBe(0);
  });
});

describe('meanReciprocalRank', () => {
  it('averages the per-query reciprocal ranks', () => {
    expect(meanReciprocalRank([1, 0.5, 0])).toBeCloseTo(0.5);
  });

  it('returns 0 for an empty list', () => {
    expect(meanReciprocalRank([])).toBe(0);
  });
});
