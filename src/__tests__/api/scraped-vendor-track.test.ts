import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/scraped-vendor/engagement');

import { POST } from '@/app/api/scraped-vendors/[id]/track/route';
import { logEngagement } from '@/lib/scraped-vendor/engagement';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('POST /api/scraped-vendors/[id]/track', () => {
  it('returns 200 and calls logEngagement for valid view event', async () => {
    vi.mocked(logEngagement).mockResolvedValueOnce();
    const req = new Request('http://t/', {
      method: 'POST',
      headers: { 'user-agent': 'Mozilla/5.0' },
      body: JSON.stringify({ event: 'view' }),
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0], {
      params: Promise.resolve({ id: '11111111-2222-3333-4444-555555555555' }),
    });
    expect(res.status).toBe(200);
    expect(logEngagement).toHaveBeenCalledWith(
      '11111111-2222-3333-4444-555555555555',
      'view',
      expect.any(String),
      'Mozilla/5.0'
    );
  });

  it('returns 400 on invalid event type', async () => {
    const req = new Request('http://t/', {
      method: 'POST',
      body: JSON.stringify({ event: 'invalid_event' }),
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0], {
      params: Promise.resolve({ id: '11111111-2222-3333-4444-555555555555' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid id (non-UUID)', async () => {
    const req = new Request('http://t/', {
      method: 'POST',
      body: JSON.stringify({ event: 'view' }),
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0], {
      params: Promise.resolve({ id: 'not-a-uuid' }),
    });
    expect(res.status).toBe(400);
  });
});
