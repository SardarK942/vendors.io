import { describe, it, expect } from 'vitest';
import {
  appendCustomRequest,
  type CustomRequestPackage,
} from '@/lib/vendor-packages/with-custom-request';

const VENDOR_ID = '00000000-0000-0000-0000-000000000001';

describe('appendCustomRequest', () => {
  it('appends a Custom Request entry to an empty list', () => {
    const result = appendCustomRequest([], VENDOR_ID);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('custom-request');
  });

  it('appends after existing packages, preserving order', () => {
    const packages = [
      { id: 'pkg-a', name: 'A' },
      { id: 'pkg-b', name: 'B' },
    ];
    const result = appendCustomRequest(packages, VENDOR_ID);
    expect(result.map((p) => p.id)).toEqual(['pkg-a', 'pkg-b', 'custom-request']);
  });

  it('does not double-append when called twice', () => {
    const once = appendCustomRequest([], VENDOR_ID);
    const twice = appendCustomRequest(once, VENDOR_ID);
    expect(twice).toHaveLength(1);
    expect(twice[0].id).toBe('custom-request');
  });

  it('returns a CustomRequestPackage with all expected fields nulled', () => {
    const result = appendCustomRequest([], VENDOR_ID);
    const custom = result[0] as CustomRequestPackage;
    expect(custom.id).toBe('custom-request');
    expect(custom.name).toBe('Custom Request');
    expect(custom.is_custom).toBe(true);
    expect(custom.base_price_cents).toBeNull();
    expect(custom.max_guests).toBeNull();
    expect(custom.duration_hours).toBeNull();
    expect(custom.events_count).toBeNull();
    expect(custom.featured_image_url).toBeNull();
    expect(custom.gallery_image_urls).toBeNull();
    expect(custom.included_items).toBeNull();
    expect(custom.vendor_notes_template).toBeNull();
    expect(custom.location_mode).toBeNull();
    expect(custom.addons).toEqual([]);
    expect(custom.description).toContain('outside our standard packages');
  });
});
