import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const autoVoidExpiredMock = vi.fn();
const sweepMock = vi.fn();
vi.mock('@/services/orders.service', () => ({
  autoVoidExpired: (...a: unknown[]) => autoVoidExpiredMock(...a),
  sweepStaleCheckoutSnapshots: (...a: unknown[]) => sweepMock(...a),
}));

const reminderRows = [{ id: 'o1', status: 'pending_confirmation', confirm_deadline_at: '' }];
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: () => {
      const c: Record<string, unknown> = {};
      c.select = () => c;
      c.eq = () => c;
      c.then = (r: (v: unknown) => void) => r({ data: reminderRows, error: null });
      return c;
    },
  })),
}));

import { POST } from '@/app/api/cron/shop-auto-void/route';
import { selectReminderOrders } from '@/lib/shop/reminders';

const H = 60 * 60 * 1000;
const NOW = new Date('2026-10-13T12:00:00.000Z');
const ord = (id: string, status: string, hoursLeft: number) => ({
  id,
  status,
  confirm_deadline_at: new Date(NOW.getTime() + hoursLeft * H).toISOString(),
});

function req(bearer?: string): NextRequest {
  return new NextRequest('http://localhost/api/cron/shop-auto-void', {
    method: 'POST',
    headers: bearer !== undefined ? { authorization: `Bearer ${bearer}` } : {},
  });
}

describe('POST /api/cron/shop-auto-void', () => {
  const ORIG = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = 's3cret';
    autoVoidExpiredMock.mockReset().mockResolvedValue({ data: { voided: 3 }, status: 200 });
    sweepMock.mockReset().mockResolvedValue({ data: { swept: 2 }, status: 200 });
  });
  afterEach(() => {
    process.env.CRON_SECRET = ORIG;
  });

  it('401 without the secret', async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(autoVoidExpiredMock).not.toHaveBeenCalled();
  });

  it('401 with the wrong secret', async () => {
    const res = await POST(req('nope'));
    expect(res.status).toBe(401);
  });

  it('with the secret runs auto-void + sweep and returns counts', async () => {
    const res = await POST(req('s3cret'));
    expect(res.status).toBe(200);
    expect(autoVoidExpiredMock).toHaveBeenCalledTimes(1);
    expect(sweepMock).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body).toMatchObject({ voided: 3, swept: 2 });
    expect(typeof body.reminded).toBe('number');
  });
});

describe('selectReminderOrders', () => {
  it('selects only pending orders whose remaining time just crossed 24h', () => {
    const out = selectReminderOrders(
      [
        ord('in', 'pending_confirmation', 23.5),
        ord('far', 'pending_confirmation', 40),
        ord('near', 'pending_confirmation', 10),
        ord('done', 'confirmed', 23.5),
        ord('edge-24', 'pending_confirmation', 24),
        ord('edge-23', 'pending_confirmation', 23),
      ],
      NOW
    );
    expect(out.map((o) => o.id)).toEqual(['in', 'edge-24']);
  });
});
