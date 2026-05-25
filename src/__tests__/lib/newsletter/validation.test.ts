import { describe, it, expect } from 'vitest';
import { newsletterSubscribeSchema, type NewsletterSource } from '@/lib/newsletter/validation';

describe('newsletterSubscribeSchema', () => {
  it('accepts a valid email with default source', () => {
    const r = newsletterSubscribeSchema.safeParse({ email: 'jane@example.com' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.source).toBe('footer');
  });

  it('accepts a valid email with explicit allowed source', () => {
    const r = newsletterSubscribeSchema.safeParse({ email: 'jane@example.com', source: 'hero' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.source).toBe('hero');
  });

  it('rejects an invalid email', () => {
    const r = newsletterSubscribeSchema.safeParse({ email: 'not-an-email' });
    expect(r.success).toBe(false);
  });

  it('rejects an empty email', () => {
    const r = newsletterSubscribeSchema.safeParse({ email: '' });
    expect(r.success).toBe(false);
  });

  it('rejects email longer than 254 chars', () => {
    const long = 'a'.repeat(250) + '@x.io'; // 255 chars
    const r = newsletterSubscribeSchema.safeParse({ email: long });
    expect(r.success).toBe(false);
  });

  it('rejects a source not in the allowlist', () => {
    const r = newsletterSubscribeSchema.safeParse({
      email: 'jane@example.com',
      source: 'random-source',
    });
    expect(r.success).toBe(false);
  });

  it('exports NewsletterSource union', () => {
    const sources: NewsletterSource[] = ['footer', 'hero', 'post-booking'];
    expect(sources).toHaveLength(3);
  });
});
