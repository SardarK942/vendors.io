import { describe, it, expect } from 'vitest';
import { buildVendorEmbeddingText, invalidateEmbeddingOnContentChange } from '@/lib/ai/embeddings';

describe('buildVendorEmbeddingText', () => {
  it('includes all populated structured fields', () => {
    const text = buildVendorEmbeddingText({
      business_name: 'Zara Studio',
      category: 'photography',
      bio: 'Candid documentary weddings.',
      subcategories: ['candid', 'traditional'],
      services: ['photography', 'videography'],
      service_area: ['Chicago', 'Naperville'],
      base_city: 'Chicago',
      languages: ['Hindi', 'Urdu'],
      served_event_types: ['wedding', 'mehndi'],
      years_in_business: 12,
    });
    expect(text).toContain('Zara Studio');
    expect(text).toContain('photography');
    expect(text).toContain('candid');
    expect(text).toContain('videography');
    expect(text).toContain('Naperville');
    expect(text).toContain('Hindi');
    expect(text).toContain('mehndi');
    expect(text).toContain('Candid documentary weddings.');
    expect(text).toContain('12');
  });

  it('omits empty/null fields without leaving stray labels or separators', () => {
    const text = buildVendorEmbeddingText({
      business_name: 'Solo Act',
      category: 'dj',
      bio: null,
      subcategories: [],
      services: null,
      service_area: [],
      base_city: null,
      languages: null,
      served_event_types: [],
      years_in_business: null,
    });
    expect(text).toContain('Solo Act');
    expect(text).toContain('dj');
    expect(text.toLowerCase()).not.toContain('serves:');
    expect(text.toLowerCase()).not.toContain('languages:');
    expect(text).not.toContain('null');
    expect(text).not.toContain('undefined');
    expect(text.trim()).toBe(text); // no leading/trailing whitespace
  });
});

describe('invalidateEmbeddingOnContentChange', () => {
  it('adds embedding: null when the payload touches an embedding-source field', () => {
    const out = invalidateEmbeddingOnContentChange({ bio: 'We serve gourmet fries.' });
    expect(out).toEqual({ bio: 'We serve gourmet fries.', embedding: null });
  });

  it('flags any of the structured source fields, not just bio', () => {
    for (const field of [
      'business_name',
      'category',
      'subcategories',
      'services',
      'service_area',
      'base_city',
      'languages',
      'served_event_types',
      'years_in_business',
    ]) {
      const out = invalidateEmbeddingOnContentChange({ [field]: 'x' });
      expect(out.embedding, `${field} should invalidate`).toBeNull();
    }
  });

  it('leaves the payload untouched when no embedding-source field is present', () => {
    const payload = { instagram_handle: 'onlyfryzz', website_url: 'https://x.com' };
    const out = invalidateEmbeddingOnContentChange(payload);
    expect(out).toEqual(payload);
    expect('embedding' in out).toBe(false);
  });

  it('does not re-embed on a pure pause toggle (is_active only)', () => {
    const out = invalidateEmbeddingOnContentChange({ is_active: true, updated_at: 'now' });
    expect('embedding' in out).toBe(false);
  });

  it('preserves the other keys when it does invalidate', () => {
    const out = invalidateEmbeddingOnContentChange({
      business_name: 'Only Fryzz',
      instagram_handle: 'onlyfryzz',
      updated_at: 'now',
    });
    expect(out).toEqual({
      business_name: 'Only Fryzz',
      instagram_handle: 'onlyfryzz',
      updated_at: 'now',
      embedding: null,
    });
  });
});
