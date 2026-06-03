import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api/auth');
vi.mock('@/lib/scraped-vendor/match');

import { POST } from '@/app/api/scraped-vendors/match/route';
import { requireUser } from '@/lib/api/auth';
import { findMatches } from '@/lib/scraped-vendor/match';
import { HttpError } from '@/lib/api/error-boundary';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('POST /api/scraped-vendors/match', () => {
  it('returns 401 when no user', async () => {
    vi.mocked(requireUser).mockRejectedValueOnce(new HttpError(401, 'Unauthorized'));
    const req = new Request('http://t/', { method: 'POST', body: JSON.stringify({}) });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(401);
  });

  it('returns matches array on valid input', async () => {
    vi.mocked(requireUser).mockResolvedValueOnce({
      // We only use the call as an auth check; user object content doesn't matter here
      user: { id: 'u1' },
      supabase: {},
    } as unknown as Awaited<ReturnType<typeof requireUser>>);
    vi.mocked(findMatches).mockResolvedValueOnce([
      {
        id: 'sv1',
        slug: 'x-abc123',
        business_name: 'X',
        category: 'carts',
        city: 'Chicago',
        instagram_handle: 'x',
        photos: [],
        bio: null,
        similarity_score: 1,
      },
    ]);
    const req = new Request('http://t/', {
      method: 'POST',
      body: JSON.stringify({ businessName: 'X', city: 'Chicago' }),
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { matches: unknown[] };
    expect(body.matches).toHaveLength(1);
  });
});
