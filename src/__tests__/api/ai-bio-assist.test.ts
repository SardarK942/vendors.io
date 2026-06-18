/**
 * B4.5 — Unit tests for POST /api/ai/bio-assist
 *
 * Tests:
 * 1. 401 when unauthenticated
 * 2. 403 when user role is not vendor (couple)
 * 3. 429 when rate-limited
 * 4. Short/missing draft → uses draft (non-polish) system prompt
 * 5. Draft ≥ 20 chars → uses polish system prompt
 * 6. Gemini throws → 503
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

// Mock getGoogleAI
vi.mock('@/lib/ai/google', () => ({
  getGoogleAI: vi.fn(),
  BIO_ASSIST_MODEL: 'gemini-2.5-flash-lite',
}));

import { requireUser } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { checkAndIncrement } from '@/lib/ai/rate-limit';
import { getGoogleAI } from '@/lib/ai/google';
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
          single: () =>
            Promise.resolve({
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

/** Creates a fake Gemini stream that emits text chunks */
function buildFakeGeminiStream(chunks: string[]) {
  async function* gen() {
    for (const chunk of chunks) {
      yield { text: () => chunk };
    }
  }
  const streamIterable = gen();
  return {
    stream: streamIterable,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/ai/bio-assist', () => {
  const mockRequireUser = requireUser as ReturnType<typeof vi.fn>;
  const mockCreateServiceRoleClient = createServiceRoleClient as ReturnType<typeof vi.fn>;
  const mockCheckAndIncrement = checkAndIncrement as ReturnType<typeof vi.fn>;
  const mockGetGoogleAI = getGoogleAI as ReturnType<typeof vi.fn>;

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
    mockCheckAndIncrement.mockResolvedValueOnce({
      allowed: true,
      remaining: 9,
      resetAt: new Date(),
    });

    const generateContentStream = vi
      .fn()
      .mockResolvedValue(buildFakeGeminiStream(['Hello', ' world']));
    const fakeModel = { generateContentStream };
    mockGetGoogleAI.mockReturnValue({ getGenerativeModel: () => fakeModel });

    const res = await POST(
      makeRequest({ businessName: 'Mehndi Co', category: 'mehndi', draft: 'short' })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');

    // Verify stream was called with the draft (non-polish) system prompt in the user content
    const streamCall = generateContentStream.mock.calls[0][0];
    const userText: string = streamCall.contents[0].parts[0].text;
    expect(userText).toContain('You write short, warm vendor bios');
  });

  it('uses polish system when draft is >= 20 chars', async () => {
    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' } });
    mockCreateServiceRoleClient.mockReturnValue(buildServiceRoleClient('vendor'));
    mockCheckAndIncrement.mockResolvedValueOnce({
      allowed: true,
      remaining: 9,
      resetAt: new Date(),
    });

    const generateContentStream = vi
      .fn()
      .mockResolvedValue(buildFakeGeminiStream(['Polished bio here.']));
    const fakeModel = { generateContentStream };
    mockGetGoogleAI.mockReturnValue({ getGenerativeModel: () => fakeModel });

    const longDraft = 'This is a draft that is long enough to trigger polish mode!';
    const res = await POST(
      makeRequest({ businessName: 'Mehndi Co', category: 'mehndi', draft: longDraft })
    );
    expect(res.status).toBe(200);

    const streamCall = generateContentStream.mock.calls[0][0];
    const userText: string = streamCall.contents[0].parts[0].text;
    expect(userText).toContain('polish vendor bios');
  });

  it('returns 503 when Gemini throws during setup', async () => {
    mockRequireUser.mockResolvedValueOnce({ user: { id: 'u-1' } });
    mockCreateServiceRoleClient.mockReturnValue(buildServiceRoleClient('vendor'));
    mockCheckAndIncrement.mockResolvedValueOnce({
      allowed: true,
      remaining: 9,
      resetAt: new Date(),
    });
    mockGetGoogleAI.mockImplementation(() => {
      throw new Error('API key not set');
    });

    const res = await POST(makeRequest({ businessName: 'Mehndi Co', category: 'mehndi' }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe('AI service unavailable');
  });
});
