/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import { getOrCreateFeedToken, rotateFeedToken } from '@/services/calendar-feed.service';

function mockSupabase(initialToken: string | null) {
  let token: string | null = initialToken;
  let state = initialToken ? 'pending' : 'not_connected';
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() =>
            Promise.resolve({
              data: { calendar_feed_token: token, calendar_feed_state: state },
              error: null,
            })
          ),
        })),
      })),
      update: vi.fn((patch: any) => ({
        eq: vi.fn(() => {
          if ('calendar_feed_token' in patch) token = patch.calendar_feed_token;
          if ('calendar_feed_state' in patch) state = patch.calendar_feed_state;
          return Promise.resolve({ data: null, error: null });
        }),
      })),
    })),
    _peek: () => ({ token, state }),
  } as any;
}

describe('getOrCreateFeedToken', () => {
  it('returns the existing token if already set', async () => {
    const sb = mockSupabase('existing-token-abc');
    const result = await getOrCreateFeedToken(sb, 'vendor-1');
    expect(result).toBe('existing-token-abc');
  });

  it('generates a fresh 22-char base64 token if absent', async () => {
    const sb = mockSupabase(null);
    const result = await getOrCreateFeedToken(sb, 'vendor-1');
    expect(result).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(sb._peek().token).toBe(result);
  });
});

describe('rotateFeedToken', () => {
  it('overwrites the token and resets state to not_connected', async () => {
    const sb = mockSupabase('old-token');
    const fresh = await rotateFeedToken(sb, 'vendor-1');
    expect(fresh).not.toBe('old-token');
    expect(fresh).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(sb._peek().state).toBe('not_connected');
  });
});
