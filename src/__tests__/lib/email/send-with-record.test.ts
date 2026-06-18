// src/__tests__/lib/email/send-with-record.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendWithRecord } from '@/lib/email/resend';

const mockSend = vi.fn();
const mockFrom = vi.fn(() => ({ update: vi.fn(() => ({ eq: vi.fn() })) }));

vi.mock('resend', () => ({
  Resend: vi.fn(function (this: { emails: { send: typeof mockSend } }, _key: string) {
    this.emails = { send: mockSend };
  }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: vi.fn(async () => ({ from: mockFrom })),
}));

describe('sendWithRecord()', () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockFrom.mockClear();
    process.env.RESEND_API_KEY = 'test_key';
  });

  it('records sent status when send succeeds and notificationId provided', async () => {
    mockSend.mockResolvedValue({ data: { id: 're_1' }, error: null });
    const out = await sendWithRecord({
      to: 'x@y.z',
      subject: 's',
      html: '<p>h</p>',
      notificationId: 'n_1',
    });
    expect(out.ok).toBe(true);
    expect(out.id).toBe('re_1');
    expect(mockFrom).toHaveBeenCalledWith('notifications');
  });

  it('records failed status when Resend returns error', async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: 'DKIM not verified' } });
    const out = await sendWithRecord({
      to: 'x@y.z',
      subject: 's',
      html: '<p>h</p>',
      notificationId: 'n_1',
    });
    expect(out.ok).toBe(false);
    expect(out.error).toBe('DKIM not verified');
  });

  it('skips update when notificationId omitted', async () => {
    mockSend.mockResolvedValue({ data: { id: 're_2' }, error: null });
    const out = await sendWithRecord({ to: 'x@y.z', subject: 's', html: '<p>h</p>' });
    expect(out.ok).toBe(true);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
