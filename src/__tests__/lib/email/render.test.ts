import { describe, it, expect } from 'vitest';
import { renderBrandedEmail } from '@/lib/email/render';

describe('renderBrandedEmail', () => {
  it('returns a full HTML document', () => {
    const html = renderBrandedEmail({ bodyHtml: '<p>Test</p>' });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('embeds the body verbatim', () => {
    const html = renderBrandedEmail({ bodyHtml: '<h2>Hi</h2><p>Body content</p>' });
    expect(html).toContain('<h2>Hi</h2>');
    expect(html).toContain('<p>Body content</p>');
  });

  it('includes the baazar wordmark in the header', () => {
    const html = renderBrandedEmail({ bodyHtml: '' });
    expect(html).toContain('baazar');
    // Hot-pink dot accent
    expect(html).toContain('#D1006C');
  });

  it('renders the current year in the footer', () => {
    const html = renderBrandedEmail({ bodyHtml: '' });
    const year = new Date().getFullYear();
    expect(html).toContain(`${year} Baazar Marketplace`);
  });

  it('uses the cream page background', () => {
    const html = renderBrandedEmail({ bodyHtml: '' });
    expect(html).toContain('#FBF6EC');
  });

  it('caps content at 600px max-width', () => {
    const html = renderBrandedEmail({ bodyHtml: '' });
    expect(html).toContain('max-width:600px');
  });

  it('does not escape the body (caller controls escaping)', () => {
    // The body is trusted (constructed by send*Email functions that escape user input)
    const html = renderBrandedEmail({ bodyHtml: '<a href="/x">link</a>' });
    expect(html).toContain('<a href="/x">link</a>');
  });
});
