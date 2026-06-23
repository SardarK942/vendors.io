// src/__tests__/lib/email/templates/layout.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import { BaazarEmailLayout } from '@/lib/email/templates/layout';

describe('BaazarEmailLayout', () => {
  it('renders preview text in head title', async () => {
    const html = await render(
      <BaazarEmailLayout preview="Test preview" unsubscribeToken="abc">
        <p>body</p>
      </BaazarEmailLayout>
    );
    expect(html).toContain('Test preview');
  });

  it('includes Baazar wordmark image', async () => {
    const html = await render(
      <BaazarEmailLayout preview="x" unsubscribeToken="abc">
        <p>body</p>
      </BaazarEmailLayout>
    );
    expect(html).toContain('wordmark.png');
  });

  it('includes CAN-SPAM footer (reply prompt, address, unsubscribe)', async () => {
    const html = await render(
      <BaazarEmailLayout preview="x" unsubscribeToken="abc123">
        <p>body</p>
      </BaazarEmailLayout>
    );
    expect(html).toContain('Reply to this email');
    expect(html).toContain('Chicago, IL');
    expect(html).toContain('unsubscribe?token=abc123');
  });
});
