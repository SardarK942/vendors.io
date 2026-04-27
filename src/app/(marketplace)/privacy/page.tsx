import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — Baazar.io',
};

export default function PrivacyPage() {
  return (
    <article className="prose prose-headings:font-semibold mx-auto max-w-3xl py-10">
      <h1>Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Last updated: 2026-04-18</p>

      <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        [LAWYER REVIEW] Placeholder language for MVP. Illinois Biometric Information Privacy Act and
        GDPR-equivalent provisions should be reviewed by counsel.
      </p>

      <h2>1. What we collect</h2>
      <ul>
        <li>
          <strong>Account</strong>: email, name, phone (optional), role (couple / vendor).
        </li>
        <li>
          <strong>Booking</strong>: event date, event type, guest count, budget, special requests,
          contact details you share with a vendor once the deposit is paid.
        </li>
        <li>
          <strong>Vendor profile</strong>: business name, portfolio images, pricing, service area,
          social handles.
        </li>
        <li>
          <strong>Payment</strong>: processed by Stripe. We do not store card numbers or bank
          accounts.
        </li>
      </ul>

      <h2>2. Who we share with</h2>
      <ul>
        <li>
          <strong>Stripe</strong> — payment processing and identity verification for vendor payouts.
        </li>
        <li>
          <strong>Supabase</strong> — database and authentication hosting.
        </li>
        <li>
          <strong>Resend</strong> — transactional email delivery.
        </li>
        <li>
          <strong>OpenAI</strong> — generating vendor search embeddings only; no personal info sent.
        </li>
        <li>
          <strong>Vercel</strong> — application hosting.
        </li>
      </ul>
      <p>
        We do not sell data. We do not share data with advertisers. We disclose information only as
        needed to operate the service and where legally required.
      </p>

      <h2>3. Retention</h2>
      <p>
        Booking details (phone, email of the other party) are purged 18 months after the event date.
        Vendor profiles remain until the vendor deletes the account. Transaction records are
        retained for 7 years per US financial regulations.
      </p>

      <h2>4. Your rights</h2>
      <p>
        You can request a copy of your data or full account deletion by emailing
        sardarm.khan942@gmail.com. Deletion requests complete within 30 days, excluding data we are
        legally required to retain (transaction history).
      </p>

      <h2>5. Cookies</h2>
      <p>
        We use strictly necessary cookies for authentication and session management. We do not use
        advertising, tracking, or analytics cookies at this time.
      </p>

      <h2>6. Security</h2>
      <p>
        Data is encrypted in transit (HTTPS) and at rest. Payment info never touches our servers.
        Access to internal systems is limited to the founding team.
      </p>

      <h2>7. Contact</h2>
      <p>Questions or deletion requests: sardarm.khan942@gmail.com.</p>
    </article>
  );
}
