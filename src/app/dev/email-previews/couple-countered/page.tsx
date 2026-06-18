// src/app/dev/email-previews/couple-countered/page.tsx
import { notFound } from 'next/navigation';
import { renderCoupleCounteredHtml } from '@/lib/email/couple-countered';

const SAMPLE = {
  coupleName: 'Priya & Rohan',
  proposedTotalCents: 285_000,
  note: 'We love your work but we are a little over budget. Would you be able to come down a bit on the total?',
  vendorAdjustmentsRemaining: 2 as const,
  bookingId: 'preview-booking-id',
};

export default function CoupleCounteredPreview() {
  if (process.env.NODE_ENV === 'production') notFound();

  const html = renderCoupleCounteredHtml(SAMPLE);

  return (
    <div style={{ padding: '16px', fontFamily: 'sans-serif' }}>
      <h2 style={{ marginBottom: '8px' }}>Couple countered email (vendor)</h2>
      <iframe
        srcDoc={html}
        style={{ width: '100%', height: '90vh', border: '1px solid #ccc', borderRadius: '6px' }}
        title="Couple counter-offer — vendor"
      />
    </div>
  );
}
