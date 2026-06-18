// src/__tests__/lib/email/couple-countered.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('@/lib/email/resend', () => import('@/lib/email/__mocks__/resend'));
import { sendCoupleCounteredEmail, renderCoupleCounteredHtml } from '@/lib/email/couple-countered';
import { getRecordedSends, clearRecordedSends } from '@/lib/email/__mocks__/resend';

describe('sendCoupleCounteredEmail()', () => {
  beforeEach(() => clearRecordedSends());

  it('subject contains couple name', async () => {
    await sendCoupleCounteredEmail({
      to: 'vendor@example.com',
      coupleName: 'Sam & Alex',
      proposedTotalCents: 95_000,
      vendorAdjustmentsRemaining: 2,
      bookingId: 'b_1',
    });
    const [send] = getRecordedSends();
    expect(send.subject).toContain('Sam & Alex sent a counter-offer on your quote');
  });

  it('HTML contains formatted proposed total', async () => {
    await sendCoupleCounteredEmail({
      to: 'vendor@example.com',
      coupleName: 'Sam & Alex',
      proposedTotalCents: 95_000,
      vendorAdjustmentsRemaining: 2,
      bookingId: 'b_1',
    });
    const [send] = getRecordedSends();
    expect(send.html).toContain('$950.00');
  });

  it('HTML contains "2 adjustments remaining" when vendorAdjustmentsRemaining=2', async () => {
    await sendCoupleCounteredEmail({
      to: 'vendor@example.com',
      coupleName: 'Sam & Alex',
      proposedTotalCents: 95_000,
      vendorAdjustmentsRemaining: 2,
      bookingId: 'b_1',
    });
    const [send] = getRecordedSends();
    expect(send.html).toContain('2 adjustments remaining');
  });

  it('HTML contains "1 adjustment remaining" (singular) when vendorAdjustmentsRemaining=1', async () => {
    await sendCoupleCounteredEmail({
      to: 'vendor@example.com',
      coupleName: 'Sam & Alex',
      proposedTotalCents: 95_000,
      vendorAdjustmentsRemaining: 1,
      bookingId: 'b_1',
    });
    const [send] = getRecordedSends();
    expect(send.html).toContain('1 adjustment remaining');
    expect(send.html).not.toContain('1 adjustments remaining');
  });

  it('truncates note to 200 chars before rendering', async () => {
    const longNote = 'x'.repeat(500);
    await sendCoupleCounteredEmail({
      to: 'vendor@example.com',
      coupleName: 'Sam & Alex',
      proposedTotalCents: 95_000,
      vendorAdjustmentsRemaining: 2,
      bookingId: 'b_1',
      note: longNote,
    });
    const [send] = getRecordedSends();
    expect(send.html).not.toContain('x'.repeat(300));
    expect(send.html).toContain('x'.repeat(200));
  });

  it('XSS defense: escapes <script> in coupleName', async () => {
    await sendCoupleCounteredEmail({
      to: 'vendor@example.com',
      coupleName: '<script>alert(1)</script>',
      proposedTotalCents: 95_000,
      vendorAdjustmentsRemaining: 2,
      bookingId: 'b_1',
    });
    const [send] = getRecordedSends();
    expect(send.html).not.toContain('<script>alert(1)</script>');
    expect(send.html).toContain('&lt;script&gt;');
  });

  it('XSS defense: escapes <script> in note', async () => {
    await sendCoupleCounteredEmail({
      to: 'vendor@example.com',
      coupleName: 'Sam & Alex',
      proposedTotalCents: 95_000,
      vendorAdjustmentsRemaining: 2,
      bookingId: 'b_1',
      note: '<script>evil()</script>',
    });
    const [send] = getRecordedSends();
    expect(send.html).not.toContain('<script>evil()</script>');
    expect(send.html).toContain('&lt;script&gt;');
  });
});

describe('renderCoupleCounteredHtml()', () => {
  it('omits note block when no note provided', () => {
    const html = renderCoupleCounteredHtml({
      coupleName: 'Sam & Alex',
      proposedTotalCents: 95_000,
      vendorAdjustmentsRemaining: 2,
      bookingId: 'b_1',
    });
    expect(html).not.toContain('<blockquote');
  });

  it('includes note in blockquote when note is provided', () => {
    const html = renderCoupleCounteredHtml({
      coupleName: 'Sam & Alex',
      proposedTotalCents: 95_000,
      note: 'Please come down a bit',
      vendorAdjustmentsRemaining: 2,
      bookingId: 'b_1',
    });
    expect(html).toContain('<blockquote');
    expect(html).toContain('Please come down a bit');
  });

  it('CTA links to booking with respond-to-counter action', () => {
    const html = renderCoupleCounteredHtml({
      coupleName: 'Sam & Alex',
      proposedTotalCents: 95_000,
      vendorAdjustmentsRemaining: 2,
      bookingId: 'booking-abc',
    });
    expect(html).toContain('/dashboard/bookings/booking-abc?action=respond-to-counter');
  });
});
