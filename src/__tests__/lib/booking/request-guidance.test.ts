import { describe, it, expect } from 'vitest';
import { getRequestGuidance } from '@/lib/booking/request-guidance';

describe('getRequestGuidance', () => {
  const KNOWN = [
    'photography',
    'videography',
    'content_creation',
    'dj',
    'photobooth',
    'live_music',
    'catering',
    'hair_makeup',
    'carts',
    'venue',
    'decor',
    'invitations',
    'gifts',
    'mehndi',
  ];

  it('returns a non-empty placeholder + bullets for every known category', () => {
    for (const category of KNOWN) {
      const g = getRequestGuidance(category);
      expect(g.placeholder.trim().length, `placeholder for ${category}`).toBeGreaterThan(0);
      expect(g.bullets.length, `bullets for ${category}`).toBeGreaterThan(0);
      expect(g.bullets.every((b) => b.trim().length > 0)).toBe(true);
    }
  });

  it('returns the generic default for an unknown category', () => {
    const g = getRequestGuidance('something_made_up');
    expect(g.placeholder.trim().length).toBeGreaterThan(0);
    expect(g.bullets).toEqual(["What you're envisioning", 'Your budget', 'Any must-haves']);
  });

  it('returns the generic default for bridal_wear (no dedicated set)', () => {
    const g = getRequestGuidance('bridal_wear');
    expect(g.bullets).toEqual(["What you're envisioning", 'Your budget', 'Any must-haves']);
  });

  it('returns the generic default for the empty-string category', () => {
    const g = getRequestGuidance('');
    expect(g.bullets).toEqual(["What you're envisioning", 'Your budget', 'Any must-haves']);
  });

  it("matches a sample category's bullets (dj)", () => {
    expect(getRequestGuidance('dj').bullets).toEqual([
      'Genres & languages',
      'Must-play songs',
      'Do-not-play list',
      'MC needs',
      'Dhol',
    ]);
  });

  it("matches a sample category's bullets (mehndi)", () => {
    expect(getRequestGuidance('mehndi').bullets).toEqual([
      'Bridal or party',
      'Coverage / design',
      'Number of guests',
      'Number of artists',
      'Hours',
      'Style',
    ]);
  });
});
