import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createDirectUpload,
  getVideoStatus,
  streamThumbnailUrl,
  streamIframeUrl,
} from '@/lib/cloudflare-stream';

const OLD_ENV = { ...process.env };
beforeEach(() => {
  process.env.CLOUDFLARE_ACCOUNT_ID = 'acct-1';
  process.env.CLOUDFLARE_STREAM_API_TOKEN = 'tok-1';
  process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN = 'customer-abc';
});
afterEach(() => {
  process.env = { ...OLD_ENV };
  vi.restoreAllMocks();
});

it('createDirectUpload posts to the CF endpoint and maps the result', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ result: { uploadURL: 'https://up.cf/abc', uid: 'vid-1' } }),
  });
  vi.stubGlobal('fetch', fetchMock);

  const out = await createDirectUpload({ maxDurationSeconds: 60 });

  expect(out).toEqual({ uploadURL: 'https://up.cf/abc', uid: 'vid-1' });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acct-1/stream/direct_upload');
  expect(init.method).toBe('POST');
  expect(init.headers.Authorization).toBe('Bearer tok-1');
  expect(JSON.parse(init.body)).toEqual({ maxDurationSeconds: 60 });
});

it('createDirectUpload throws on non-ok response', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
  );
  await expect(createDirectUpload()).rejects.toThrow(/direct_upload failed/i);
});

it('getVideoStatus maps readyToStream', async () => {
  const validUid = 'a'.repeat(32);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: { readyToStream: true } }) })
  );
  expect(await getVideoStatus(validUid)).toEqual({ uid: validUid, readyToStream: true });
});

it('getVideoStatus rejects an invalid uid without calling fetch', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  await expect(getVideoStatus('bad/uid')).rejects.toThrow(/invalid/i);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('builds thumbnail and iframe URLs from the customer subdomain', () => {
  expect(streamThumbnailUrl('vid-1')).toBe(
    'https://customer-abc.cloudflarestream.com/vid-1/thumbnails/thumbnail.jpg'
  );
  expect(streamIframeUrl('vid-1')).toBe('https://customer-abc.cloudflarestream.com/vid-1/iframe');
});

it('throws a clear error when the public subdomain is not configured', () => {
  delete process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN;
  expect(() => streamThumbnailUrl('vid-1')).toThrow(/Cloudflare Stream subdomain/i);
});
