/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { POST } from '@/app/api/settings/password/route';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const mockedCreate = vi.mocked(createServerSupabaseClient);

function buildRequest(body: unknown) {
  return new Request('http://localhost/api/settings/password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/settings/password', () => {
  beforeEach(() => vi.clearAllMocks());

  it('400s on missing fields', async () => {
    mockedCreate.mockResolvedValue({} as any);
    const res = await POST(buildRequest({ current_password: 'x' }));
    expect(res.status).toBe(400);
  });

  it('401s when user is not signed in', async () => {
    mockedCreate.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    } as any);
    const res = await POST(buildRequest({ current_password: 'a', new_password: 'b12345678' }));
    expect(res.status).toBe(401);
  });

  it('400s when current password is wrong', async () => {
    mockedCreate.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.co' } } }),
        signInWithPassword: vi
          .fn()
          .mockResolvedValue({ error: { message: 'Invalid login credentials' } }),
        updateUser: vi.fn(),
      },
    } as any);
    const res = await POST(buildRequest({ current_password: 'wrong', new_password: 'b12345678' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/current password/i);
  });

  it('200s and updates on happy path', async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    mockedCreate.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.co' } } }),
        signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
        updateUser,
      },
    } as any);
    const res = await POST(buildRequest({ current_password: 'ok', new_password: 'new123456' }));
    expect(res.status).toBe(200);
    expect(updateUser).toHaveBeenCalledWith({ password: 'new123456' });
  });
});
