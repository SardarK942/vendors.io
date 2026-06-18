// src/__tests__/lib/email/review-received.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('@/lib/email/resend', () => import('@/lib/email/__mocks__/resend'));
import { sendReviewReceivedEmail } from '@/lib/email/review-received';
import { getRecordedSends, clearRecordedSends } from '@/lib/email/__mocks__/resend';

describe('sendReviewReceivedEmail()', () => {
  beforeEach(() => clearRecordedSends());

  it('renders star glyphs + truncates body to 240', async () => {
    await sendReviewReceivedEmail({
      to: 'v@x.com',
      coupleName: 'Sam & Riya',
      rating: 4,
      body: 'b'.repeat(500),
      vendorSlug: 'epic-events',
    });
    const [send] = getRecordedSends();
    expect(send.subject).toBe('Sam & Riya left you a 4-star review');
    expect(send.html).toContain('★★★★☆');
    expect(send.html).toContain('b'.repeat(240));
    expect(send.html).not.toContain('b'.repeat(260));
    expect(send.html).toContain('/vendors/epic-events?tab=reviews');
  });

  it('escapes HTML in interpolated values (XSS defence)', async () => {
    await sendReviewReceivedEmail({
      to: 'v@x.com',
      coupleName: '<script>alert(1)</script>',
      rating: 5,
      body: '<img src=x onerror=alert(1)>',
      vendorSlug: 'vendor-slug',
    });
    const [send] = getRecordedSends();
    expect(send.html).not.toContain('<script>alert(1)</script>');
    expect(send.html).toContain('&lt;script&gt;');
    expect(send.html).not.toContain('<img src=x onerror=alert(1)>');
    expect(send.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
