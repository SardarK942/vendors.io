import { describe, it, expect, vi } from 'vitest';

// search.ts constructs `new OpenAI(...)` at module scope — mock the SDK so the
// import doesn't throw on a missing OPENAI_API_KEY in the test env.
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: vi.fn() } };
    embeddings = { create: vi.fn() };
  },
}));
vi.mock('@/lib/ai/embeddings', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0)),
}));

import { semanticSearch } from '@/lib/ai/search';

describe('semanticSearch', () => {
  it('forwards the category to the RPC as p_category', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const supabase = { rpc } as never;

    await semanticSearch(supabase, 'punjabi dj', 40, 'dj');

    expect(rpc).toHaveBeenCalledWith(
      'search_vendors_semantic',
      expect.objectContaining({ match_count: 40, p_category: 'dj' })
    );
  });

  it('passes p_category undefined when no category is given', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const supabase = { rpc } as never;

    await semanticSearch(supabase, 'nice photos');

    const args = rpc.mock.calls[0][1] as { p_category?: string };
    expect(args.p_category).toBeUndefined();
  });
});
