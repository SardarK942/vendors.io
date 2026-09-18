import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock('@/lib/cloudflare-stream', () => ({ getVideoStatus: vi.fn() }));

import { GET } from '@/app/api/stream/status/[uid]/route';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getVideoStatus } from '@/lib/cloudflare-stream';

const mockedClient = vi.mocked(createServerSupabaseClient);
const mockedStatus = vi.mocked(getVideoStatus);

function client(user: { id: string } | null) {
  return { auth: { getUser: () => Promise.resolve({ data: { user }, error: null }) } };
}
function ctx(uid: string) {
  return { params: Promise.resolve({ uid }) };
}
function req() {
  return new NextRequest('http://localhost/api/stream/status/vid-1');
}

beforeEach(() => vi.clearAllMocks());

it('401 when not signed in', async () => {
  mockedClient.mockResolvedValue(client(null) as never);
  const res = await GET(req(), ctx('vid-1'));
  expect(res.status).toBe(401);
});

it('200 returns readiness', async () => {
  mockedClient.mockResolvedValue(client({ id: 'u1' }) as never);
  mockedStatus.mockResolvedValue({ uid: 'vid-1', readyToStream: true });
  const res = await GET(req(), ctx('vid-1'));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ uid: 'vid-1', readyToStream: true });
});
