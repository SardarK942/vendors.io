import { describe, it, expect, vi, beforeEach } from 'vitest';

const buildIcsMock = vi.fn();
const recordPollMock = vi.fn();
const serviceRoleMock = vi.fn();

vi.mock('@/services/calendar-feed.service', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildIcsForVendor: (...a: any[]) => buildIcsMock(...a),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordPoll: (...a: any[]) => recordPollMock(...a),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => serviceRoleMock(),
}));

import { GET } from '@/app/api/cal/[token]/route';

function mockReq(ua = 'Google-Calendar-Importer', ip = '1.2.3.4') {
  return new Request('http://localhost/api/cal/abc.ics', {
    headers: { 'user-agent': ua, 'x-forwarded-for': ip },
  });
}

beforeEach(() => {
  buildIcsMock.mockReset();
  recordPollMock.mockReset();
  serviceRoleMock.mockReset();
});

describe('GET /api/cal/[token].ics', () => {
  it('returns 404 for unknown token', async () => {
    serviceRoleMock.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        }),
      }),
    });
    const res = await GET(mockReq(), { params: { token: 'abc123456789abcdefghij.ics' } });
    expect(res.status).toBe(404);
  });

  it('serves text/calendar with the ICS body for a valid token', async () => {
    serviceRoleMock.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { id: 'v-1' }, error: null }),
            gte: () => Promise.resolve({ count: 0, data: [], error: null }),
          }),
        }),
      }),
    });
    buildIcsMock.mockResolvedValue('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n');
    const res = await GET(mockReq(), { params: { token: 'abc123456789abcdefghij.ics' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/calendar/);
    expect(await res.text()).toMatch(/^BEGIN:VCALENDAR/);
    expect(recordPollMock).toHaveBeenCalledOnce();
  });

  it('strips the .ics suffix from the token before lookup', async () => {
    const eqMock = vi.fn(() => ({
      maybeSingle: () => Promise.resolve({ data: { id: 'v-1' }, error: null }),
      gte: () => Promise.resolve({ count: 0, data: [], error: null }),
    }));
    serviceRoleMock.mockReturnValue({ from: () => ({ select: () => ({ eq: eqMock }) }) });
    buildIcsMock.mockResolvedValue('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n');
    await GET(mockReq(), { params: { token: 'xyz123abc456def789ghi.ics' } });
    expect(eqMock).toHaveBeenCalledWith('calendar_feed_token', 'xyz123abc456def789ghi');
  });
});
