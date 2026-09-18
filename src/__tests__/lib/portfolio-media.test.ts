import { describe, it, expect } from 'vitest';
import { mergePortfolioMedia } from '@/lib/portfolio-media';

describe('mergePortfolioMedia', () => {
  it('puts photos first, then clips, preserving order', () => {
    const r = mergePortfolioMedia(['p1', 'p2'], ['v1', 'v2']);
    expect(r).toEqual([
      { type: 'image', url: 'p1' },
      { type: 'image', url: 'p2' },
      { type: 'video', uid: 'v1' },
      { type: 'video', uid: 'v2' },
    ]);
  });

  it('handles empty videos and empty photos', () => {
    expect(mergePortfolioMedia(['p1'], [])).toEqual([{ type: 'image', url: 'p1' }]);
    expect(mergePortfolioMedia([], ['v1'])).toEqual([{ type: 'video', uid: 'v1' }]);
    expect(mergePortfolioMedia([], [])).toEqual([]);
  });
});
