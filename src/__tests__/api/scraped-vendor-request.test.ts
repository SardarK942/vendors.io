import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/email/resend');
vi.mock('@/lib/supabase/server');

import { POST } from '@/app/api/scraped-vendors/[id]/request/route';
import {
  sendClaimRequestTeamEmail,
  sendClaimRequestVendorEmail,
  sendRemovalRequestTeamEmail,
  sendRemovalConfirmationVendorEmail,
} from '@/lib/email/resend';
import { createServiceRoleClient } from '@/lib/supabase/server';

beforeEach(() => {
  vi.resetAllMocks();
  const mockClient = {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { business_name: 'Test Cart' } }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'req-1' } }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  };
  vi.mocked(createServiceRoleClient).mockResolvedValue(mockClient as never);
  vi.mocked(sendClaimRequestTeamEmail).mockResolvedValue(true);
  vi.mocked(sendClaimRequestVendorEmail).mockResolvedValue(true);
  vi.mocked(sendRemovalRequestTeamEmail).mockResolvedValue(true);
  vi.mocked(sendRemovalConfirmationVendorEmail).mockResolvedValue(true);
});

describe('POST /api/scraped-vendors/[id]/request', () => {
  it('handles claim_request action: inserts row + sends both emails', async () => {
    const req = new Request('http://t/', {
      method: 'POST',
      body: JSON.stringify({
        action: 'claim_request',
        requester_email: 'vendor@example.com',
        requester_name: 'Priya',
        requester_ig: 'priyahennaco',
      }),
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0], {
      params: Promise.resolve({ id: '11111111-2222-3333-4444-555555555555' }),
    });
    expect(res.status).toBe(200);
    expect(sendClaimRequestTeamEmail).toHaveBeenCalled();
    expect(sendClaimRequestVendorEmail).toHaveBeenCalled();
    expect(sendRemovalRequestTeamEmail).not.toHaveBeenCalled();
  });

  it('handles remove action: also marks vendor disputed', async () => {
    const req = new Request('http://t/', {
      method: 'POST',
      body: JSON.stringify({
        action: 'remove',
        requester_email: 'vendor@example.com',
        reason: 'not my business',
      }),
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0], {
      params: Promise.resolve({ id: '11111111-2222-3333-4444-555555555555' }),
    });
    expect(res.status).toBe(200);
    expect(sendRemovalRequestTeamEmail).toHaveBeenCalled();
    expect(sendRemovalConfirmationVendorEmail).toHaveBeenCalled();
  });

  it('returns 400 on invalid action', async () => {
    const req = new Request('http://t/', {
      method: 'POST',
      body: JSON.stringify({ action: 'wat', requester_email: 'x@y.com' }),
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0], {
      params: Promise.resolve({ id: '11111111-2222-3333-4444-555555555555' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 on missing requester_email', async () => {
    const req = new Request('http://t/', {
      method: 'POST',
      body: JSON.stringify({ action: 'remove' }),
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0], {
      params: Promise.resolve({ id: '11111111-2222-3333-4444-555555555555' }),
    });
    expect(res.status).toBe(400);
  });
});
