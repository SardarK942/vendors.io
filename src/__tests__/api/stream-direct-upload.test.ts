import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }));
vi.mock('@/lib/cloudflare-stream', () => ({ createDirectUpload: vi.fn() }));

import { POST } from '@/app/api/stream/direct-upload/route';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { createDirectUpload } from '@/lib/cloudflare-stream';

const mockedClient = vi.mocked(createServerSupabaseClient);
const mockedRl = vi.mocked(checkRateLimit);
const mockedCreate = vi.mocked(createDirectUpload);

function client(user: { id: string } | null, vendorProfile: { id: string } | null = { id: 'vp1' }) {
  return {
    auth: { getUser: () => Promise.resolve({ data: { user }, error: null }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: vendorProfile, error: null }),
        }),
      }),
    }),
  };
}
function req() {
  return new NextRequest('http://localhost/api/stream/direct-upload', { method: 'POST' });
}

beforeEach(() => vi.clearAllMocks());

it('401 when not signed in', async () => {
  mockedClient.mockResolvedValue(client(null) as never);
  const res = await POST(req());
  expect(res.status).toBe(401);
});

it('403 when the user has no vendor profile', async () => {
  mockedClient.mockResolvedValue(client({ id: 'u1' }, null) as never);
  const res = await POST(req());
  expect(res.status).toBe(403);
  expect(mockedRl).not.toHaveBeenCalled();
});

it('429 when rate limited', async () => {
  mockedClient.mockResolvedValue(client({ id: 'u1' }) as never);
  mockedRl.mockResolvedValue({ ok: false, message: 'slow down' } as never);
  const res = await POST(req());
  expect(res.status).toBe(429);
});

it('200 returns uploadURL + uid on happy path', async () => {
  mockedClient.mockResolvedValue(client({ id: 'u1' }) as never);
  mockedRl.mockResolvedValue({ ok: true } as never);
  mockedCreate.mockResolvedValue({ uploadURL: 'https://up.cf/x', uid: 'vid-9' });
  const res = await POST(req());
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ uploadURL: 'https://up.cf/x', uid: 'vid-9' });
  expect(mockedCreate).toHaveBeenCalledWith({ maxDurationSeconds: 60 });
});

it('502 when Cloudflare fails', async () => {
  mockedClient.mockResolvedValue(client({ id: 'u1' }) as never);
  mockedRl.mockResolvedValue({ ok: true } as never);
  mockedCreate.mockRejectedValue(new Error('cf down'));
  const res = await POST(req());
  expect(res.status).toBe(502);
});
