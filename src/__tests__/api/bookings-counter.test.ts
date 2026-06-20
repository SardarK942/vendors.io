/**
 * Task 14 — POST /api/bookings/[id]/counter endpoint tests.
 *
 * Strategy: mock coupleCounterBooking from the service (approach a) for fast,
 * narrow feedback. Also mock requireUser / createServerSupabaseClient.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/services/booking.service', () => ({
  coupleCounterBooking: vi.fn(),
}));

import { POST } from '@/app/api/bookings/[id]/counter/route';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { coupleCounterBooking } from '@/services/booking.service';

const BOOKING_ID = 'booking-abc';
const USER_ID = 'user-123';

const mockSupabase = {
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } }, error: null }),
  },
};

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/bookings/${BOOKING_ID}/counter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/bookings/[id]/counter', () => {
  const mockCreateClient = createServerSupabaseClient as ReturnType<typeof vi.fn>;
  const mockCounter = coupleCounterBooking as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockResolvedValue(mockSupabase);
  });

  it('200 — returns booking on success', async () => {
    const fakeBooking = {
      id: BOOKING_ID,
      status: 'couple_counter_offer',
      total_price_cents: 90000,
    };
    mockCounter.mockResolvedValueOnce({ ok: true, booking: fakeBooking });

    const res = await POST(makeRequest({ totalCents: 90000, note: 'Can you do 900?' }), {
      params: { id: BOOKING_ID },
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ data: fakeBooking });
    expect(mockCounter).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: BOOKING_ID,
        actorUserId: USER_ID,
        proposedTotalCents: 90000,
        note: 'Can you do 900?',
      })
    );
  });

  it('400 — missing totalCents returns error before calling service', async () => {
    const res = await POST(makeRequest({ note: 'no amount here' }), {
      params: { id: BOOKING_ID },
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain('totalCents must be');
    expect(mockCounter).not.toHaveBeenCalled();
  });

  it('400 — totalCents of zero returns error before calling service', async () => {
    const res = await POST(makeRequest({ totalCents: 0 }), {
      params: { id: BOOKING_ID },
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain('totalCents must be');
    expect(mockCounter).not.toHaveBeenCalled();
  });

  it('400 — negative totalCents returns error before calling service', async () => {
    const res = await POST(makeRequest({ totalCents: -100 }), {
      params: { id: BOOKING_ID },
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain('totalCents must be');
    expect(mockCounter).not.toHaveBeenCalled();
  });

  it('400 — float totalCents returns error before calling service', async () => {
    const res = await POST(makeRequest({ totalCents: 99.99 }), {
      params: { id: BOOKING_ID },
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain('totalCents must be');
    expect(mockCounter).not.toHaveBeenCalled();
  });

  it('401 — unauthenticated request (getUser returns null user)', async () => {
    mockCreateClient.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    });

    const res = await POST(makeRequest({ totalCents: 90000 }), {
      params: { id: BOOKING_ID },
    });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBeDefined();
    expect(mockCounter).not.toHaveBeenCalled();
  });

  it('403 — service returns forbidden', async () => {
    mockCounter.mockResolvedValueOnce({
      ok: false,
      code: 'forbidden',
      message: 'You are not the customer on this booking.',
    });

    const res = await POST(makeRequest({ totalCents: 90000 }), {
      params: { id: BOOKING_ID },
    });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe('You are not the customer on this booking.');
  });

  it('409 — service returns counter_cap_reached', async () => {
    mockCounter.mockResolvedValueOnce({
      ok: false,
      code: 'counter_cap_reached',
      message: 'You have used both counter-offers for this booking.',
    });

    const res = await POST(makeRequest({ totalCents: 90000 }), {
      params: { id: BOOKING_ID },
    });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe('You have used both counter-offers for this booking.');
  });

  it('400 — service returns invalid_state', async () => {
    mockCounter.mockResolvedValueOnce({
      ok: false,
      code: 'invalid_state',
      message: "Cannot counter from status 'pending_quote'.",
    });

    const res = await POST(makeRequest({ totalCents: 90000 }), {
      params: { id: BOOKING_ID },
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Cannot counter from status 'pending_quote'.");
  });

  it('404 — service returns not_found', async () => {
    mockCounter.mockResolvedValueOnce({
      ok: false,
      code: 'not_found',
      message: 'Booking not found.',
    });

    const res = await POST(makeRequest({ totalCents: 90000 }), {
      params: { id: BOOKING_ID },
    });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe('Booking not found.');
  });
});
