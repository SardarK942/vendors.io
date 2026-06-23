// src/__tests__/lib/email/templates/customer-welcome.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import { CustomerWelcomeTemplate } from '@/lib/email/templates/customer-welcome';

describe('CustomerWelcomeTemplate', () => {
  it('greets customer by first name in heading', async () => {
    const html = await render(<CustomerWelcomeTemplate firstName="Priya" unsubscribeToken="abc" />);
    expect(html).toContain('Welcome to Baazar, Priya');
  });

  it('includes all 3 verbatim sections', async () => {
    const html = await render(<CustomerWelcomeTemplate firstName="Test" unsubscribeToken="abc" />);
    expect(html).toContain('Find your vendors');
    expect(html).toContain('culturally-focused wedding and event vendors');
    expect(html).toContain('Request, don');
    expect(html).toContain('no charge until you confirm');
    expect(html).toContain('5% to lock it in');
    expect(html).toContain('Pay the remaining 95% directly');
  });

  it('CTA links to /vendors', async () => {
    const html = await render(<CustomerWelcomeTemplate firstName="Test" unsubscribeToken="abc" />);
    expect(html).toContain('https://www.baazar.io/vendors');
    expect(html).toContain('Start browsing');
  });
});
