import { afterEach, describe, expect, it } from 'vitest';
import { createServiceRoleClient } from '../../../lib/supabase/server';
import { isCdnExpiryRisk } from '../../../../scripts/scraper/rehost-photos';

const skip = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_TAG = `__rehost_test_${Date.now()}__`;

describe('isCdnExpiryRisk', () => {
  it('flags Instagram CDN URLs', () => {
    expect(isCdnExpiryRisk('https://scontent-iad3-1.cdninstagram.com/v/abc.jpg')).toBe(true);
    expect(isCdnExpiryRisk('https://www.instagram.com/p/abc/media/?size=l')).toBe(true);
  });

  it('flags Google Maps photo URLs', () => {
    expect(
      isCdnExpiryRisk(
        'https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=xyz&key=abc'
      )
    ).toBe(true);
  });

  it('does NOT flag UploadThing URLs', () => {
    expect(isCdnExpiryRisk('https://utfs.io/f/abc-def.jpg')).toBe(false);
    expect(isCdnExpiryRisk('https://uploadthing.com/something.png')).toBe(false);
  });

  it('does NOT flag empty / non-URL strings', () => {
    expect(isCdnExpiryRisk('')).toBe(false);
    expect(isCdnExpiryRisk('not-a-url')).toBe(false);
  });
});

describe.skipIf(skip)('rehostPhotosForUnclaimedRows (integration, env-gated)', () => {
  afterEach(async () => {
    const supabase = await createServiceRoleClient();
    await supabase.from('scraped_vendors').delete().contains('tags', [TEST_TAG]);
  });

  it('skips rows that already have only stable URLs', async () => {
    const supabase = await createServiceRoleClient();
    await supabase.from('scraped_vendors').insert({
      source: 'hand_curated',
      business_name: 'Already-Stable Row',
      tags: [TEST_TAG],
      state: 'IL',
      photos: ['https://utfs.io/f/abc-def.jpg'],
      raw: {},
    });

    const { rehostPhotosForUnclaimedRows } =
      await import('../../../../scripts/scraper/rehost-photos');
    const result = await rehostPhotosForUnclaimedRows({ limit: 10, tagFilter: TEST_TAG });
    // 1 row visited, 0 photos uploaded (nothing to rehost)
    expect(result.rowsVisited).toBeGreaterThanOrEqual(1);
    expect(result.photosUploaded).toBe(0);
  });
});
