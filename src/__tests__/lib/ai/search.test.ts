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
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { semanticSearch } from '@/lib/ai/search';
import { generateEmbedding } from '@/lib/ai/embeddings';

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

  it('degrades to [] (does not throw, never hits the RPC) when embedding generation fails', async () => {
    // Simulates an OpenAI 401 / outage — must not 500 the /vendors page.
    (generateEmbedding as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('401 Your API key has been invalidated.')
    );
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: 'x' }], error: null });
    const supabase = { rpc } as never;

    const res = await semanticSearch(supabase, 'henna artist', 40, 'mehndi');

    expect(res).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
});
