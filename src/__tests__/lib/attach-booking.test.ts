import { describe, it, expect, vi, afterEach } from 'vitest';
import { attachBookingToFunction } from '@/lib/events/attach-booking';

afterEach(() => vi.unstubAllGlobals());

describe('attachBookingToFunction', () => {
  it('POSTs the function id to the booking attach route', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const ok = await attachBookingToFunction('bk-1', 'fn-9');

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/bookings/bk-1/attach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_function_id: 'fn-9' }),
    });
  });

  it('returns false when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await attachBookingToFunction('bk-1', 'fn-9')).toBe(false);
  });

  it('returns false on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await attachBookingToFunction('bk-1', 'fn-9')).toBe(false);
  });
});
