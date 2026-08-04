// src/app/dev/email-previews/event-completed/page.tsx
import { notFound } from 'next/navigation';
import { renderEventCompletedHtml } from '@/lib/email/event-completed';

const SAMPLE = {
  vendorName: 'Epic Events',
  coupleName: 'Priya & Rohan',
  eventTypeLabel: 'Sangeet',
  sequence: 1,
  eventsCount: 2,
  bookingId: 'preview-booking-id',
};

export default function EventCompletedPreview() {
  if (process.env.NODE_ENV === 'production') notFound();

  const coupleHtml = renderEventCompletedHtml({ ...SAMPLE, recipientRole: 'couple' });
  const vendorHtml = renderEventCompletedHtml({ ...SAMPLE, recipientRole: 'vendor' });

  return (
    <div style={{ display: 'flex', gap: '16px', padding: '16px', fontFamily: 'sans-serif' }}>
      <div style={{ flex: 1 }}>
        <h2 style={{ marginBottom: '8px' }}>Couple variant</h2>
        <iframe
          srcDoc={coupleHtml}
          width={800}
          height={800}
          style={{ width: '100%', height: '90vh', border: '1px solid #ccc', borderRadius: '6px' }}
          title="Event completed — couple"
        />
      </div>
      <div style={{ flex: 1 }}>
        <h2 style={{ marginBottom: '8px' }}>Vendor variant</h2>
        <iframe
          srcDoc={vendorHtml}
          width={800}
          height={800}
          style={{ width: '100%', height: '90vh', border: '1px solid #ccc', borderRadius: '6px' }}
          title="Event completed — vendor"
        />
      </div>
    </div>
  );
}
