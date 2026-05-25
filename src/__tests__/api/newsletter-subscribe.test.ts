import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { POST } from '@/app/api/newsletter/subscribe/route';

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/newsletter/subscribe', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function buildSupabase(opts: {
  user?: { id: string } | null;
  insertError?: { code: string; message: string } | null;
}) {
  const insert = vi.fn().mockResolvedValue({ data: null, error: opts.insertError ?? null });
  return {
    insert,
    client: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: opts.user ?? null }, error: null }),
      },
      from: vi.fn(() => ({ insert })),
    },
  };
}

describe('POST /api/newsletter/subscribe', () => {
  const mockCreateClient = createServerSupabaseClient as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 + inserts on valid anonymous submission', async () => {
    const sb = buildSupabase({ user: null, insertError: null });
    mockCreateClient.mockResolvedValueOnce(sb.client);

    const res = await POST(makePostRequest({ email: 'jane@example.com' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(sb.insert).toHaveBeenCalledWith({
      email: 'jane@example.com',
      source: 'footer',
      user_id: null,
    });
  });

  it('returns 200 + sets user_id when authenticated', async () => {
    const sb = buildSupabase({ user: { id: 'u-1' }, insertError: null });
    mockCreateClient.mockResolvedValueOnce(sb.client);

    const res = await POST(makePostRequest({ email: 'jane@example.com', source: 'hero' }));
    expect(res.status).toBe(200);
    expect(sb.insert).toHaveBeenCalledWith({
      email: 'jane@example.com',
      source: 'hero',
      user_id: 'u-1',
    });
  });

  it('returns 200 (idempotent) on unique-violation', async () => {
    const sb = buildSupabase({
      user: null,
      insertError: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });
    mockCreateClient.mockResolvedValueOnce(sb.client);

    const res = await POST(makePostRequest({ email: 'jane@example.com' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true });
  });

  it('returns 400 on invalid email', async () => {
    const res = await POST(makePostRequest({ email: 'not-an-email' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
  });

  it('returns 400 on missing body', async () => {
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 500 on non-unique-violation DB error', async () => {
    const sb = buildSupabase({
      user: null,
      insertError: { code: '42P01', message: 'relation does not exist' },
    });
    mockCreateClient.mockResolvedValueOnce(sb.client);

    const res = await POST(makePostRequest({ email: 'jane@example.com' }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ ok: false });
  });
});
