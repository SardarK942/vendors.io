// src/__tests__/lib/email/event-completed.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/email/resend', () => import('@/lib/email/__mocks__/resend'));

import { sendEventCompletedEmail } from '@/lib/email/event-completed';
import { getRecordedSends, clearRecordedSends } from '@/lib/email/__mocks__/resend';

describe('sendEventCompletedEmail()', () => {
  beforeEach(() => clearRecordedSends());

  it('couple variant subject + body framing', async () => {
    await sendEventCompletedEmail({
      to: 'c@x.com',
      recipientRole: 'couple',
      vendorName: 'Epic Events',
      coupleName: 'Sam',
      eventTypeLabel: 'Sangeet',
      sequence: 1,
      eventsCount: 2,
      bookingId: 'b_1',
    });
    const [send] = getRecordedSends();
    expect(send.subject).toContain('Event 1 of 2 marked complete with Epic Events');
    expect(send.html).toContain('owed directly to Epic Events');
    expect(send.html).not.toContain('Pay balance'); // <- spec rule: not the payment rail
  });

  it('vendor variant subject + body framing', async () => {
    await sendEventCompletedEmail({
      to: 'v@x.com',
      recipientRole: 'vendor',
      vendorName: 'Epic Events',
      coupleName: 'Sam',
      eventTypeLabel: 'Sangeet',
      sequence: 1,
      eventsCount: 2,
      bookingId: 'b_1',
    });
    const [send] = getRecordedSends();
    expect(send.subject).toContain('marked complete with Sam');
    expect(send.html).toContain('Collect the balance per your payment terms');
  });
});
