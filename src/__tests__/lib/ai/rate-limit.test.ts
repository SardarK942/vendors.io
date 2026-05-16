import { describe, it, expect, vi } from 'vitest';
import { checkAndIncrement } from '@/lib/ai/rate-limit';

const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_CALLS = 10;

type RowData = {
  user_id: string;
  calls_in_window: number;
  window_started_at: string;
} | null;

function buildSupabase(row: RowData, opts?: { upsertError?: boolean; updateError?: boolean }) {
  const upsert = vi.fn().mockResolvedValue({ error: opts?.upsertError ? { message: 'db error' } : null });
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: opts?.updateError ? { message: 'db error' } : null }),
  });

  return {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: string) => ({
          maybeSingle: () => Promise.resolve({ data: row, error: null }),
        }),
      }),
      upsert,
      update,
    }),
    _upsert: upsert,
    _update: update,
  };
}

describe('checkAndIncrement', () => {
  it('allows and sets calls_in_window=1 for a fresh user with no row', async () => {
    const sb = buildSupabase(null);
    const result = await checkAndIncrement(sb as never, 'user-1');

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(MAX_CALLS - 1);
    expect(sb._upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', calls_in_window: 1 })
    );
  });

  it('denies when calls_in_window >= MAX_CALLS within window', async () => {
    const row = {
      user_id: 'user-2',
      calls_in_window: MAX_CALLS,
      window_started_at: new Date(Date.now() - 1000).toISOString(), // 1 second ago, window not expired
    };
    const sb = buildSupabase(row);
    const result = await checkAndIncrement(sb as never, 'user-2');

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('resets and allows when window has expired', async () => {
    const row = {
      user_id: 'user-3',
      calls_in_window: MAX_CALLS, // at limit, but window expired
      window_started_at: new Date(Date.now() - WINDOW_MS - 1000).toISOString(),
    };
    const sb = buildSupabase(row);
    const result = await checkAndIncrement(sb as never, 'user-3');

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(MAX_CALLS - 1);
    expect(sb._upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-3', calls_in_window: 1 })
    );
  });

  it('increments counter when under limit within window', async () => {
    const row = {
      user_id: 'user-4',
      calls_in_window: 5,
      window_started_at: new Date(Date.now() - 1000).toISOString(),
    };
    const sb = buildSupabase(row);
    const result = await checkAndIncrement(sb as never, 'user-4');

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(MAX_CALLS - 5 - 1);
    expect(sb._update).toHaveBeenCalledWith({ calls_in_window: 6 });
  });

  it('returns remaining=0 and allowed=false when exactly at limit', async () => {
    const windowStart = Date.now() - 1000;
    const row = {
      user_id: 'user-5',
      calls_in_window: MAX_CALLS,
      window_started_at: new Date(windowStart).toISOString(),
    };
    const sb = buildSupabase(row);
    const result = await checkAndIncrement(sb as never, 'user-5');

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    // resetAt should be roughly windowStart + WINDOW_MS
    expect(result.resetAt.getTime()).toBeCloseTo(windowStart + WINDOW_MS, -3);
  });
});
