/**
 * B4.5 — Unit tests for POST /api/ai/bio-assist
 *
 * Tests:
 * 1. 401 when unauthenticated
 * 2. 403 when user role is not vendor (couple)
 * 3. 429 when rate-limited
 * 4. Short/missing draft → uses draft (non-polish) system prompt
 * 5. Draft ≥ 20 chars → uses polish system prompt
 * 6. Anthropic throws → 503
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock requireUser
vi.mock('@/lib/api/auth', () => ({
  requireUser: vi.fn(),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock createServiceRoleClient
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: vi.fn(),
}));

// Mock rate-limit
vi.mock('@/lib/ai/rate-limit', () => ({
  checkAndIncrement: vi.fn(),
}));

// Mock getAnthropic
vi.mock('@/lib/ai/anthropic', () => ({
  getAnthropic: vi.fn(),
}));

import { requireUser } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { checkAndIncrement } from '@/lib/ai/rate-limit';
import { getAnthropic } from '@/lib/ai/anthropic';
import { POST } from '@/app/api/ai/bio-assist/route';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/ai/bio-assist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function buildServiceRoleClient(role: string | null) {
  return {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: string) => ({
          single: () => Promise.resolve({
            data: role ? { role } : null,
            error: null,
          }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  };
}

/** Creates a fake Anthropic stream that emits text chunks */
function buildFakeStream(chunks: string[]) {
  async function* gen() {
    for (const chunk of chunks) {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: chunk } };
    }
  }
  return {
    [Symbol.asyncIterator]: gen,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/ai/bio-assist', () => {
  const mockRequireUser = requireUser as ReturnType<typeof vi.fn>;
  const mockCreateServiceRoleClient = createServiceRoleClient as ReturnType<typeof vi.fn>;
  const mockCheckAndIncrement = checkAndIncrement as ReturnType<typeof vi.fn>;
  const mockGetAnthropic = getAnthropic as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireUser.mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await POST(makeRequest({ businessName: 'X', category: 'mehndi' }));
    expect(res.status).toBe(401);
  });

  it('returns 403 when user role is couple (not vendor)', async () => {
    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' } });
    mockCreateServiceRoleClient.mockReturnValue(buildServiceRoleClient('couple'));

    const res = await POST(makeRequest({ businessName: 'X', category: 'mehndi' }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Vendors only');
  });

  it('returns 429 when rate-limited', async () => {
    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' } });
    mockCreateServiceRoleClient.mockReturnValue(buildServiceRoleClient('vendor'));
    mockCheckAndIncrement.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 3600_000),
    });

    const res = await POST(makeRequest({ businessName: 'X', category: 'mehndi' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).not.toBeNull();
    const json = await res.json();
    expect(json.error).toBe('Rate limit exceeded');
  });

  it('uses draft system (non-polish) when draft is absent or short', async () => {
    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' } });
    mockCreateServiceRoleClient.mockReturnValue(buildServiceRoleClient('vendor'));
    mockCheckAndIncrement.mockResolvedValueOnce({ allowed: true, remaining: 9, resetAt: new Date() });

    const fakeStream = buildFakeStream(['Hello', ' world']);
    const fakeAnthropic = {
      messages: { stream: vi.fn().mockReturnValue(fakeStream) },
    };
    mockGetAnthropic.mockReturnValue(fakeAnthropic);

    const res = await POST(makeRequest({ businessName: 'Mehndi Co', category: 'mehndi', draft: 'short' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');

    // Verify stream was called with the draft (non-polish) system
    const streamCall = fakeAnthropic.messages.stream.mock.calls[0][0];
    expect(streamCall.system).toContain('You write short, warm vendor bios');
  });

  it('uses polish system when draft is >= 20 chars', async () => {
    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' } });
    mockCreateServiceRoleClient.mockReturnValue(buildServiceRoleClient('vendor'));
    mockCheckAndIncrement.mockResolvedValueOnce({ allowed: true, remaining: 9, resetAt: new Date() });

    const fakeStream = buildFakeStream(['Polished bio here.']);
    const fakeAnthropic = {
      messages: { stream: vi.fn().mockReturnValue(fakeStream) },
    };
    mockGetAnthropic.mockReturnValue(fakeAnthropic);

    const longDraft = 'This is a draft that is long enough to trigger polish mode!';
    const res = await POST(makeRequest({ businessName: 'Mehndi Co', category: 'mehndi', draft: longDraft }));
    expect(res.status).toBe(200);

    const streamCall = fakeAnthropic.messages.stream.mock.calls[0][0];
    expect(streamCall.system).toContain('polish vendor bios');
  });

  it('returns 503 when Anthropic throws during setup', async () => {
    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' } });
    mockCreateServiceRoleClient.mockReturnValue(buildServiceRoleClient('vendor'));
    mockCheckAndIncrement.mockResolvedValueOnce({ allowed: true, remaining: 9, resetAt: new Date() });
    mockGetAnthropic.mockImplementation(() => { throw new Error('API key not set'); });

    const res = await POST(makeRequest({ businessName: 'Mehndi Co', category: 'mehndi' }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe('AI service unavailable');
  });
});
