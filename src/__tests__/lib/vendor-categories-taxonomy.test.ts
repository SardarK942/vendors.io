import { describe, it, expect } from 'vitest';
import { VENDOR_CATEGORIES, VENDOR_CATEGORY_LABELS } from '@/lib/utils';

describe('VENDOR_CATEGORIES', () => {
  it('includes content_creation and gifts', () => {
    expect(VENDOR_CATEGORIES).toContain('content_creation');
    expect(VENDOR_CATEGORIES).toContain('gifts');
    expect(VENDOR_CATEGORIES).toHaveLength(15);
  });

  it('has a label for every category', () => {
    for (const c of VENDOR_CATEGORIES) {
      expect(VENDOR_CATEGORY_LABELS[c], `missing label for ${c}`).toBeTruthy();
    }
    expect(VENDOR_CATEGORY_LABELS.content_creation).toBe('Content Creation / Reels');
    expect(VENDOR_CATEGORY_LABELS.gifts).toBe('Gifts & Favors');
  });
});
