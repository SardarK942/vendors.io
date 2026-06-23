import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import { Vendor48hFollowupTemplate } from '@/lib/email/templates/vendor-followup-48h';

describe('Vendor48hFollowupTemplate', () => {
  it('mentions profile live for 2 days', async () => {
    const html = await render(
      <Vendor48hFollowupTemplate businessName="Test" unsubscribeToken="abc" />
    );
    expect(html).toContain('been live for 2 days');
  });

  it('includes 3 tips verbatim', async () => {
    const html = await render(
      <Vendor48hFollowupTemplate businessName="Test" unsubscribeToken="abc" />
    );
    expect(html).toContain('Add 5+ portfolio photos');
    expect(html).toContain('Set your response time to 4 hours or less');
    expect(html).toContain('Complete your bio with specifics');
  });

  it('CTA links to setup/basics', async () => {
    const html = await render(
      <Vendor48hFollowupTemplate businessName="Test" unsubscribeToken="abc" />
    );
    expect(html).toContain('dashboard/profile/setup/basics');
    expect(html).toContain('Edit your profile');
  });
});
