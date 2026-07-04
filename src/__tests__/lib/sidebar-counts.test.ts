/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import {
  getBookingsNeedsActionCount,
  getUnreadNotificationsCount,
} from '@/lib/dashboard/sidebar-counts';

function mockCountResponse(count: number, error: unknown = null) {
  const resolved = Promise.resolve({ count, error });
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.is = vi.fn(() => chain);
  chain.then = resolved.then.bind(resolved);
  return { from: vi.fn(() => chain), _chain: chain };
}

describe('getBookingsNeedsActionCount', () => {
  it('returns count for vendor filtering by vendor_profile_id + pending_quote', async () => {
    const { from } = mockCountResponse(3);
    const supabase = { from } as any;
    const count = await getBookingsNeedsActionCount(supabase, 'vendor', 'u1', 'biz1');
    expect(count).toBe(3);
    expect(from).toHaveBeenCalledWith('bookings');
  });

  it('returns 0 for vendor when activeBusinessId is null', async () => {
    const { from } = mockCountResponse(3);
    const supabase = { from } as any;
    const count = await getBookingsNeedsActionCount(supabase, 'vendor', 'u1', null);
    expect(count).toBe(0);
    expect(from).not.toHaveBeenCalled();
  });

  it('returns count for couple filtering by couple_user_id + accepted/adjusted_quote_sent', async () => {
    const { from } = mockCountResponse(2);
    const supabase = { from } as any;
    const count = await getBookingsNeedsActionCount(supabase, 'couple', 'u1', null);
    expect(count).toBe(2);
  });

  it('returns 0 on supabase error', async () => {
    const { from } = mockCountResponse(0, { message: 'boom' });
    const supabase = { from } as any;
    const count = await getBookingsNeedsActionCount(supabase, 'vendor', 'u1', 'biz1');
    expect(count).toBe(0);
  });
});

describe('getUnreadNotificationsCount', () => {
  it('returns count for the current user where read_at is null', async () => {
    const { from } = mockCountResponse(5);
    const supabase = { from } as any;
    const count = await getUnreadNotificationsCount(supabase, 'u1');
    expect(count).toBe(5);
    expect(from).toHaveBeenCalledWith('notifications');
  });

  it('returns 0 on error', async () => {
    const { from } = mockCountResponse(0, { message: 'boom' });
    const supabase = { from } as any;
    const count = await getUnreadNotificationsCount(supabase, 'u1');
    expect(count).toBe(0);
  });
});
