// src/__tests__/lib/email/templates/vendor-welcome.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import { VendorWelcomeTemplate } from '@/lib/email/templates/vendor-welcome';

describe('VendorWelcomeTemplate', () => {
  it('greets vendor by business name in heading', async () => {
    const html = await render(
      <VendorWelcomeTemplate
        businessName="Epic Photo Booth"
        profileSlug="epic-photo-booth"
        unsubscribeToken="abc"
      />
    );
    expect(html).toContain('Welcome to Baazar, Epic Photo Booth');
  });

  it('shows profile URL with slug', async () => {
    const html = await render(
      <VendorWelcomeTemplate businessName="Test" profileSlug="test-slug" unsubscribeToken="abc" />
    );
    expect(html).toContain('baazar.io/vendors/test-slug');
    expect(html).toContain('find you and send booking requests');
  });

  it('includes 3-step "how it works" list', async () => {
    const html = await render(
      <VendorWelcomeTemplate businessName="Test" profileSlug="test" unsubscribeToken="abc" />
    );
    expect(html).toContain('Couples discover your profile');
    expect(html).toContain('They request a booking');
    expect(html).toContain('You accept, they pay a 5% deposit');
  });
});
