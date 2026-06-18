// src/app/dev/email-previews/review-received/page.tsx
import { notFound } from 'next/navigation';
import { renderReviewReceivedHtml } from '@/lib/email/review-received';

const SAMPLE = {
  coupleName: 'Priya & Arjun',
  rating: 5,
  body: 'Absolutely incredible experience from start to finish. The team was professional, responsive, and went above and beyond to make our wedding day perfect. Every detail was handled with care and the photos speak for themselves. We could not have asked for a better vendor.',
  vendorSlug: 'moments-by-milan',
};

export default function ReviewReceivedPreview() {
  if (process.env.NODE_ENV === 'production') notFound();

  const html = renderReviewReceivedHtml(SAMPLE);

  return (
    <div style={{ padding: '16px', fontFamily: 'sans-serif' }}>
      <h2 style={{ marginBottom: '8px' }}>Review received email (vendor)</h2>
      <iframe
        srcDoc={html}
        style={{ width: '100%', height: '90vh', border: '1px solid #ccc', borderRadius: '6px' }}
        title="Review received — vendor"
      />
    </div>
  );
}
