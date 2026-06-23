// src/__tests__/lib/email/templates/vendor-first-booking.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import { VendorFirstBookingTemplate } from '@/lib/email/templates/vendor-first-booking';

describe('VendorFirstBookingTemplate', () => {
  it('celebrates the first booking', async () => {
    const html = await render(
      <VendorFirstBookingTemplate
        customerFirstName="Priya"
        eventType="wedding"
        eventDate="2026-09-15"
        totalCents={500_000}
        depositCents={25_000}
        packageName="Premium Photo Package"
        responseSlaHours={24}
        bookingId="bkg-1"
        unsubscribeToken="abc"
      />
    );
    expect(html).toContain('Congratulations');
    expect(html).toContain('first request');
    expect(html).toContain('Priya wants to book you');
    expect(html).toContain('wedding on 2026-09-15');
  });

  it('shows total + deposit + package name', async () => {
    const html = await render(
      <VendorFirstBookingTemplate
        customerFirstName="Test"
        eventType="mehndi"
        eventDate="2026-08-01"
        totalCents={150_000}
        depositCents={7_500}
        packageName="Mehndi Package"
        responseSlaHours={24}
        bookingId="bkg-1"
        unsubscribeToken="abc"
      />
    );
    expect(html).toContain('$1,500');
    expect(html).toContain('$75');
    expect(html).toContain('Mehndi Package');
  });

  it('CTA links to booking detail', async () => {
    const html = await render(
      <VendorFirstBookingTemplate
        customerFirstName="Test"
        eventType="wedding"
        eventDate="2026-09-15"
        totalCents={500_000}
        depositCents={25_000}
        packageName="Pkg"
        responseSlaHours={24}
        bookingId="bkg-123"
        unsubscribeToken="abc"
      />
    );
    expect(html).toContain('Respond now');
    expect(html).toContain('dashboard/bookings/bkg-123');
  });
});
