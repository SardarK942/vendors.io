import { describe, expect, it } from 'vitest';
import { extractUtKey } from '../../lib/uploadthing';

describe('extractUtKey', () => {
  it('extracts the key from a legacy utfs.io/f/<key> URL', () => {
    expect(extractUtKey('https://utfs.io/f/abc123-image.jpg')).toBe('abc123-image.jpg');
  });

  it('extracts the key from a newer .ufsUrl (<appId>.ufs.sh/f/<key>) URL', () => {
    expect(extractUtKey('https://my-app-id.ufs.sh/f/KEY_9f8e7d.png')).toBe('KEY_9f8e7d.png');
  });

  it('tolerates a query string on the URL', () => {
    expect(extractUtKey('https://utfs.io/f/abc123.webp?v=2')).toBe('abc123.webp');
  });

  it('handles a subdomain of utfs.io', () => {
    expect(extractUtKey('https://sub.utfs.io/f/xyz789')).toBe('xyz789');
  });

  it('handles an uploadthing.com host', () => {
    expect(extractUtKey('https://uploadthing.com/f/deadbeef')).toBe('deadbeef');
  });

  it('tolerates a legacy /<key> path without the /f/ segment', () => {
    expect(extractUtKey('https://utfs.io/onlykey.jpg')).toBe('onlykey.jpg');
  });

  it('returns null for a non-UploadThing host', () => {
    expect(extractUtKey('https://scontent.cdninstagram.com/v/t51/photo.jpg')).toBeNull();
    expect(extractUtKey('https://maps.googleapis.com/maps/api/place/photo?x=1')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(extractUtKey('')).toBeNull();
  });

  it('returns null for a non-URL / unparseable string', () => {
    expect(extractUtKey('not a url')).toBeNull();
    expect(extractUtKey('utfs.io/f/nokey')).toBeNull(); // no protocol → unparseable
  });

  it('returns null for a UT host with no path segment', () => {
    expect(extractUtKey('https://utfs.io')).toBeNull();
    expect(extractUtKey('https://utfs.io/')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(extractUtKey(null as unknown as string)).toBeNull();
    expect(extractUtKey(undefined as unknown as string)).toBeNull();
  });
});
