import { describe, it, expect, vi, beforeEach } from 'vitest';

const getFeedStatusMock = vi.fn();
const getOrCreateFeedTokenMock = vi.fn();
const rotateFeedTokenMock = vi.fn();
const requireUserMock = vi.fn();
const activeVendorMock = vi.fn();

vi.mock('@/services/calendar-feed.service', () => ({
  getFeedStatus: (...a: unknown[]) => getFeedStatusMock(...a),
  getOrCreateFeedToken: (...a: unknown[]) => getOrCreateFeedTokenMock(...a),
  rotateFeedToken: (...a: unknown[]) => rotateFeedTokenMock(...a),
}));
vi.mock('@/lib/api/auth', () => ({
  requireUser: (...a: unknown[]) => requireUserMock(...a),
}));
vi.mock('@/lib/vendor/active', () => ({
  getActiveVendorProfileId: (...a: unknown[]) => activeVendorMock(...a),
}));

import { GET as statusGet } from '@/app/api/vendor-calendar/feed/status/route';
import { POST as intentPost } from '@/app/api/vendor-calendar/feed/intent/route';

beforeEach(() => {
  getFeedStatusMock.mockReset();
  getOrCreateFeedTokenMock.mockReset();
  rotateFeedTokenMock.mockReset();
  requireUserMock.mockReset();
  activeVendorMock.mockReset();
  process.env.NEXT_PUBLIC_APP_URL = 'https://baazar.io';
});

describe('GET /api/vendor-calendar/feed/status', () => {
  it('returns 401 when no active vendor', async () => {
    requireUserMock.mockResolvedValue({ user: { id: 'user-1' }, supabase: {} });
    activeVendorMock.mockResolvedValue(null);
    const res = await statusGet(new Request('http://localhost/api/vendor-calendar/feed/status'));
    expect(res.status).toBe(401);
  });

  it('returns the FeedStatus payload', async () => {
    requireUserMock.mockResolvedValue({ user: { id: 'user-1' }, supabase: {} });
    activeVendorMock.mockResolvedValue('vendor-1');
    getFeedStatusMock.mockResolvedValue({
      state: 'pending',
      intent_method: 'google',
      connected_at: null,
      connected_via_ua: null,
      last_poll_at: null,
      polls_24h: 0,
      feed_url: 'https://baazar.io/api/cal/abc.ics',
      has_first_booking: false,
    });
    const res = await statusGet(new Request('http://localhost/api/vendor-calendar/feed/status'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe('pending');
    expect(body.feed_url).toMatch(/abc\.ics/);
  });
});

describe('POST /api/vendor-calendar/feed/intent', () => {
  it('rejects unknown methods with 400', async () => {
    requireUserMock.mockResolvedValue({ user: { id: 'user-1' }, supabase: {} });
    activeVendorMock.mockResolvedValue('vendor-1');
    const req = new Request('http://localhost/api/vendor-calendar/feed/intent', {
      method: 'POST',
      body: JSON.stringify({ method: 'icalcloud9' }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await intentPost(req);
    expect(res.status).toBe(400);
  });

  it('flips to pending, returns feed_url', async () => {
    const updateEq = vi.fn(() => Promise.resolve({ error: null }));
    const mockSb = { from: () => ({ update: () => ({ eq: updateEq }) }) };
    requireUserMock.mockResolvedValue({ user: { id: 'user-1' }, supabase: mockSb });
    activeVendorMock.mockResolvedValue('vendor-1');
    getOrCreateFeedTokenMock.mockResolvedValue('tokenABC');
    const req = new Request('http://localhost/api/vendor-calendar/feed/intent', {
      method: 'POST',
      body: JSON.stringify({ method: 'google' }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await intentPost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe('pending');
    expect(body.feed_url).toBe('https://baazar.io/api/cal/tokenABC.ics');
  });
});
