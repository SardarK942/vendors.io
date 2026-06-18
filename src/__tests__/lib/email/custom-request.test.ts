// src/__tests__/lib/email/custom-request.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('@/lib/email/resend', () => import('@/lib/email/__mocks__/resend'));
import { sendCustomRequestEmail } from '@/lib/email/custom-request';
import { getRecordedSends, clearRecordedSends } from '@/lib/email/__mocks__/resend';

describe('sendCustomRequestEmail()', () => {
  beforeEach(() => clearRecordedSends());

  it('subject contains first name only + truncates description to 200', async () => {
    const longDesc = 'a'.repeat(500);
    await sendCustomRequestEmail({
      to: 'v@x.com',
      coupleFirstName: 'Sam',
      coupleCity: 'Chicago',
      eventType: 'sangeet',
      eventDate: '2026-07-15',
      headcount: 120,
      location: 'Drury Lane',
      description: longDesc,
      bookingId: 'b_1',
    });
    const [send] = getRecordedSends();
    expect(send.subject).toBe('New custom request from Sam — sangeet on 2026-07-15');
    expect(send.html).not.toContain('a'.repeat(300));
    expect(send.html).toContain('a'.repeat(200));
  });
});
