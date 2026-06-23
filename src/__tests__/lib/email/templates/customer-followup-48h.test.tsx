// src/__tests__/lib/email/templates/customer-followup-48h.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import { Customer48hFollowupTemplate } from '@/lib/email/templates/customer-followup-48h';

const SAMPLE_VENDORS = [
  { name: 'Epic Photo Booth', slug: 'epic-photo-booth', category: 'photobooth' },
  { name: 'Henna by Priya', slug: 'henna-by-priya', category: 'mehndi' },
  { name: 'DJ Raj', slug: 'dj-raj', category: 'dj' },
];

describe('Customer48hFollowupTemplate', () => {
  it('uses event-specific copy when hasEvent=true', async () => {
    const html = await render(
      <Customer48hFollowupTemplate
        hasEvent={true}
        eventType="wedding"
        eventDate="2026-09-15"
        daysUntilEvent={85}
        suggestedVendors={SAMPLE_VENDORS}
        primaryCategory="photography"
        unsubscribeToken="abc"
      />
    );
    expect(html).toContain('wedding is coming up on');
    expect(html).toContain('85');
  });

  it('uses just-browsing copy when hasEvent=false', async () => {
    const html = await render(
      <Customer48hFollowupTemplate
        hasEvent={false}
        eventType={null}
        eventDate={null}
        daysUntilEvent={null}
        suggestedVendors={SAMPLE_VENDORS}
        primaryCategory={null}
        unsubscribeToken="abc"
      />
    );
    expect(html).toContain('Take another look');
    expect(html).toContain('3 trending now');
  });

  it('renders 3 vendor cards inline', async () => {
    const html = await render(
      <Customer48hFollowupTemplate
        hasEvent={false}
        eventType={null}
        eventDate={null}
        daysUntilEvent={null}
        suggestedVendors={SAMPLE_VENDORS}
        primaryCategory={null}
        unsubscribeToken="abc"
      />
    );
    expect(html).toContain('Epic Photo Booth');
    expect(html).toContain('Henna by Priya');
    expect(html).toContain('DJ Raj');
  });
});
