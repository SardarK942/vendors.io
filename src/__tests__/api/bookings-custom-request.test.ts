import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/services/notifications.service', () => ({
  notifyCustomRequestReceived: vi.fn().mockResolvedValue({ id: 'notif-1' }),
}));

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { notifyCustomRequestReceived } from '@/services/notifications.service';
import { POST } from '@/app/api/bookings/custom-request/route';

const VALID_BODY = {
  vendor_slug: 'henna-by-anya',
  event_date: '2026-10-17',
  guest_count: 150,
  event_type: 'mehndi',
  description: 'a'.repeat(120),
};

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/bookings/custom-request', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function buildSupabase(opts: {
  user?: { id: string } | null;
  vendor?: { id: string; user_id: string } | null;
  insertResult?: { data?: { id: string } | null; error?: { message: string } | null };
}) {
  const insertChain = {
    select: vi.fn(() => ({
      single: vi
        .fn()
        .mockResolvedValue(opts.insertResult ?? { data: { id: 'booking-1' }, error: null }),
    })),
  };
  const insert = vi.fn(() => insertChain);
  const vendorChain = {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: opts.vendor ?? null, error: null }),
        })),
      })),
    })),
  };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: opts.user ?? null }, error: null }),
    },
    from: vi.fn((table: string) => {
      if (table === 'vendor_profiles') return vendorChain;
      if (table === 'bookings') return { insert };
      throw new Error(`Unexpected table: ${table}`);
    }),
    insert,
  };
}

describe('POST /api/bookings/custom-request', () => {
  const mockCreateClient = createServerSupabaseClient as ReturnType<typeof vi.fn>;
  const mockNotify = notifyCustomRequestReceived as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    const sb = buildSupabase({ user: null });
    mockCreateClient.mockResolvedValueOnce(sb);
    const res = await POST(makePostRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid body', async () => {
    const sb = buildSupabase({ user: { id: 'u-1' } });
    mockCreateClient.mockResolvedValueOnce(sb);
    const res = await POST(makePostRequest({ ...VALID_BODY, guest_count: 0 }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when vendor not found', async () => {
    const sb = buildSupabase({ user: { id: 'u-1' }, vendor: null });
    mockCreateClient.mockResolvedValueOnce(sb);
    const res = await POST(makePostRequest(VALID_BODY));
    expect(res.status).toBe(404);
  });

  it('returns 200 + booking_id on success + dispatches notification', async () => {
    const sb = buildSupabase({
      user: { id: 'u-1' },
      vendor: { id: 'vp-1', user_id: 'vendor-user-1' },
    });
    mockCreateClient.mockResolvedValueOnce(sb);

    const res = await POST(makePostRequest(VALID_BODY));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, booking_id: 'booking-1' });
    expect(sb.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        vendor_profile_id: 'vp-1',
        couple_user_id: 'u-1',
        package_id: null,
        event_date: '2026-10-17',
        guest_count: 150,
        event_type: 'mehndi',
        special_requests: VALID_BODY.description,
        status: 'pending_quote',
        total_price_cents: 0,
      })
    );
    expect(mockNotify).toHaveBeenCalledWith(
      sb,
      'vendor-user-1',
      expect.objectContaining({
        bookingId: 'booking-1',
        eventDate: '2026-10-17',
      })
    );
  });

  it('returns 500 on insert error', async () => {
    const sb = buildSupabase({
      user: { id: 'u-1' },
      vendor: { id: 'vp-1', user_id: 'vendor-user-1' },
      insertResult: { data: null, error: { message: 'fail' } },
    });
    mockCreateClient.mockResolvedValueOnce(sb);
    const res = await POST(makePostRequest(VALID_BODY));
    expect(res.status).toBe(500);
  });
});
