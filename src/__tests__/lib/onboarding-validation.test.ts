import { describe, it, expect } from 'vitest';
import { basicsSchema } from '@/lib/onboarding/validation';

const base = { businessName: 'Studio X', category: 'photography', bio: 'We shoot weddings.' };

describe('basicsSchema — services', () => {
  it('accepts valid service slugs', () => {
    const r = basicsSchema.safeParse({
      ...base,
      services: ['photography', 'videography', 'content_creation'],
    });
    expect(r.success).toBe(true);
  });

  it('rejects an unknown service slug', () => {
    const r = basicsSchema.safeParse({ ...base, services: ['photography', 'not_a_service'] });
    expect(r.success).toBe(false);
  });

  it('defaults services to [] when omitted', () => {
    const r = basicsSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.services).toEqual([]);
  });
});
