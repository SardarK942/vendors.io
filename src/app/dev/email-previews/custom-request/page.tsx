// src/app/dev/email-previews/custom-request/page.tsx
import { notFound } from 'next/navigation';
import { renderCustomRequestHtml } from '@/lib/email/custom-request';

const SAMPLE = {
  coupleFirstName: 'Priya',
  coupleCity: 'Chicago',
  eventType: 'sangeet',
  eventDate: '2026-09-20',
  headcount: 150,
  location: 'Drury Lane Banquets, Oakbrook Terrace',
  description:
    'We are looking for a DJ and live dhol player for our sangeet. We want a mix of Bollywood and Punjabi music, and someone who can read the crowd. We have around 150 guests and the venue has a large dance floor.',
  bookingId: 'preview-booking-id',
};

export default function CustomRequestPreview() {
  if (process.env.NODE_ENV === 'production') notFound();

  const html = renderCustomRequestHtml(SAMPLE);

  return (
    <div style={{ padding: '16px', fontFamily: 'sans-serif' }}>
      <h2 style={{ marginBottom: '8px' }}>Custom request email (vendor)</h2>
      <iframe
        srcDoc={html}
        width={800}
        height={800}
        style={{ width: '100%', height: '90vh', border: '1px solid #ccc', borderRadius: '6px' }}
        title="Custom request — vendor"
      />
    </div>
  );
}
