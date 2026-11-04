import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const verifyMock = vi.fn();
const applyMock = vi.fn();
const state = {
  existing: null as { handled_at: string | null } | null,
  inserts: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
};

vi.mock('@/lib/docuseal/verify', () => ({
  verifyDocusealWebhook: (...a: unknown[]) => verifyMock(...a),
  DOCUSEAL_SIGNATURE_HEADER: 'X-Docuseal-Signature',
}));
vi.mock('@/services/docuseal.service', () => ({
  applyWebhookEvent: (...a: unknown[]) => applyMock(...a),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: state.existing }) }),
      }),
      insert: async (row: Record<string, unknown>) => {
        state.inserts.push(row);
        return { error: null };
      },
      update: (row: Record<string, unknown>) => ({
        eq: async () => {
          state.updates.push(row);
          return { error: null };
        },
      }),
    }),
  }),
}));

import { POST } from '@/app/api/webhooks/docuseal/route';

const goodBody = JSON.stringify({
  event_type: 'form.completed',
  timestamp: '2026-11-01T10:00:00Z',
  data: { submission: { id: 42 }, role: 'Vendor', external_id: 'c-1' },
});

function req(body: string): NextRequest {
  return new NextRequest('http://localhost/api/webhooks/docuseal', {
    method: 'POST',
    body,
    headers: { 'X-Docuseal-Signature': 's' },
  });
}

describe('POST /api/webhooks/docuseal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.existing = null;
    state.inserts = [];
    state.updates = [];
    verifyMock.mockReturnValue(true);
    applyMock.mockResolvedValue({ data: { status: 'sent_couple' } });
  });

  it('rejects invalid signature (401), no state change', async () => {
    verifyMock.mockReturnValue(false);
    const res = await POST(req(goodBody));
    expect(res.status).toBe(401);
    expect(applyMock).not.toHaveBeenCalled();
    expect(state.inserts).toHaveLength(0);
  });

  it('returns 400 for authenticated but malformed body', async () => {
    const res = await POST(req(JSON.stringify({ nope: true })));
    expect(res.status).toBe(400);
    expect(applyMock).not.toHaveBeenCalled();
    expect(state.inserts).toHaveLength(0);
  });

  it('records, delegates, stamps handled_at, returns 200', async () => {
    const res = await POST(req(goodBody));
    expect(res.status).toBe(200);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].event_id).toBe('form.completed:42:Vendor:2026-11-01T10:00:00Z');
    expect(applyMock).toHaveBeenCalledWith(expect.anything(), {
      type: 'form.completed',
      submissionId: '42',
      role: 'Vendor',
      externalId: 'c-1',
    });
    expect(state.updates.at(-1)?.handled_at).toBeTruthy();
  });

  it('already-handled event_id is a no-op 200', async () => {
    state.existing = { handled_at: '2026-11-01T10:00:01Z' };
    const res = await POST(req(goodBody));
    expect(res.status).toBe(200);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('service failure returns 500 and leaves handled_at null', async () => {
    applyMock.mockResolvedValue({ error: 'boom', status: 500 });
    const res = await POST(req(goodBody));
    expect(res.status).toBe(500);
    expect(state.updates.at(-1)).toMatchObject({ handled_at: null, error: 'boom' });
  });
});
