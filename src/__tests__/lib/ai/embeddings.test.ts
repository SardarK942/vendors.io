import { describe, it, expect } from 'vitest';
import { buildVendorEmbeddingText } from '@/lib/ai/embeddings';

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
