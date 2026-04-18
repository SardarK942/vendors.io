import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — Vendors.io',
};

export default function TermsPage() {
  return (
    <article className="prose prose-headings:font-semibold mx-auto max-w-3xl py-10">
      <h1>Terms of Service</h1>
      <p className="text-sm text-muted-foreground">Last updated: 2026-04-18</p>

      <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        [LAWYER REVIEW] This is placeholder language drafted for MVP launch. A licensed Illinois
        attorney should review before real customer traffic.
      </p>

      <h2>1. Who we are</h2>
      <p>
        Vendors.io (&quot;the Platform&quot;, &quot;we&quot;) is a marketplace that connects couples
        planning Desi weddings with independent service vendors in the Chicago area. We are not a
        vendor ourselves; we facilitate introductions, quotes, and hold deposits.
      </p>

      <h2>2. Hold deposits and cancellation</h2>
      <p>
        When a couple accepts a vendor&apos;s quote, they pay a 10% hold deposit through the
        Platform. This deposit holds the vendor&apos;s availability for the event date.
      </p>
      <ul>
        <li>
          <strong>Full refund</strong> if the couple cancels within 24 hours of payment.
        </li>
        <li>
          <strong>50% refund</strong> if the couple cancels more than 30 days before the event.
        </li>
        <li>
          <strong>No refund</strong> if the couple cancels within 30 days of the event.
        </li>
        <li>
          <strong>Full refund</strong> if the vendor cancels, regardless of timing.
        </li>
      </ul>
      <p>
        The Platform retains 30% of the deposit as its service fee. The remaining 70% is released to
        the vendor after the event is marked complete (manually or automatically 48 hours after the
        event date, assuming no dispute).
      </p>

      <h2>3. Disputes</h2>
      <p>
        Either party may dispute an event outcome within 48 hours of the event date. Filing a
        dispute pauses automatic completion. Our team reviews each dispute within 3 business days.
        We may adjust the refund split, retain funds in escrow pending resolution, or take action on
        either party&apos;s account.
      </p>

      <h2>4. Vendor obligations</h2>
      <p>
        Vendors are independent contractors, not employees or agents of the Platform. Vendors are
        solely responsible for the quality, timing, and legality of the services they deliver.
      </p>
      <p>
        Two strikes (no-shows or same-day cancellations classified as &quot;vendor fault&quot;) in a
        calendar year result in a temporary freeze of the vendor&apos;s account.
      </p>

      <h2>5. Couple obligations</h2>
      <p>
        By paying a deposit, couples agree to pay the remaining balance directly to the vendor
        before or after the event per the vendor&apos;s terms. Remaining balance is not collected or
        held by the Platform.
      </p>

      <h2>6. Platform liability</h2>
      <p>
        The Platform is not liable for the quality, conduct, timing, or legality of services
        delivered by vendors. Our role is limited to introduction, payment processing, and dispute
        mediation as described above. Maximum liability in any case is limited to the deposit amount
        held by the Platform for that specific booking.
      </p>

      <h2>7. Prohibited uses</h2>
      <p>
        You may not use the Platform to (a) circumvent the deposit flow by contacting vendors
        off-platform before the deposit is paid, (b) misrepresent your identity or the services
        offered, (c) attempt to defraud other users or the Platform.
      </p>

      <h2>8. Arbitration</h2>
      <p>
        [LAWYER REVIEW] Any dispute between you and the Platform shall be resolved by binding
        arbitration in Cook County, Illinois, under the rules of the American Arbitration
        Association. You waive the right to participate in a class action.
      </p>

      <h2>9. Changes</h2>
      <p>
        We may update these terms. Continued use of the Platform after an update constitutes
        acceptance. Material changes will be emailed to registered users at least 14 days in
        advance.
      </p>

      <h2>10. Contact</h2>
      <p>Questions about these terms: contact support at sardarm.khan942@gmail.com.</p>
    </article>
  );
}
