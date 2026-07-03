/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { POST } from '@/app/api/settings/email/route';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const mockedCreate = vi.mocked(createServerSupabaseClient);

function buildRequest(body: unknown) {
  return new Request('http://localhost/api/settings/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/settings/email', () => {
  beforeEach(() => vi.clearAllMocks());

  it('400s on missing or invalid email', async () => {
    mockedCreate.mockResolvedValue({} as any);
    const res = await POST(buildRequest({ new_email: 'not-an-email' }));
    expect(res.status).toBe(400);
  });

  it('401s when not signed in', async () => {
    mockedCreate.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    } as any);
    const res = await POST(buildRequest({ new_email: 'a@b.co' }));
    expect(res.status).toBe(401);
  });

  it('200s and calls updateUser on happy path', async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    mockedCreate.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
        updateUser,
      },
    } as any);
    const res = await POST(buildRequest({ new_email: 'new@example.com' }));
    expect(res.status).toBe(200);
    expect(updateUser).toHaveBeenCalledWith({ email: 'new@example.com' });
  });
});
