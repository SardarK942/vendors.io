import { beforeEach, describe, expect, test, vi } from 'vitest';

const upload = vi.fn();
const createSignedUrl = vi.fn();
const from = vi.fn(() => ({ upload, createSignedUrl }));

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({ storage: { from } }),
}));

import { getContractSignedUrl, storeContractArtifact } from '@/lib/storage/contracts-store';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('storeContractArtifact', () => {
  test('uploads to contracts/{bookingId}/signed.pdf and returns the key', async () => {
    upload.mockResolvedValue({ data: { path: 'x' }, error: null });
    const body = Buffer.from('pdf');
    const key = await storeContractArtifact({
      bookingId: 'b1',
      kind: 'signed',
      body,
      contentType: 'application/pdf',
    });
    expect(key).toBe('contracts/b1/signed.pdf');
    expect(from).toHaveBeenCalledWith('contracts');
    expect(upload).toHaveBeenCalledWith('contracts/b1/signed.pdf', body, {
      contentType: 'application/pdf',
      upsert: true,
    });
  });

  test('uses certificate.pdf for certificate kind', async () => {
    upload.mockResolvedValue({ data: { path: 'x' }, error: null });
    const key = await storeContractArtifact({
      bookingId: 'b2',
      kind: 'certificate',
      body: new ArrayBuffer(2),
      contentType: 'application/pdf',
    });
    expect(key).toBe('contracts/b2/certificate.pdf');
  });

  test('throws if upload errors', async () => {
    upload.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(
      storeContractArtifact({
        bookingId: 'b1',
        kind: 'signed',
        body: Buffer.from('x'),
        contentType: 'application/pdf',
      })
    ).rejects.toThrow(/boom/);
  });
});

describe('getContractSignedUrl', () => {
  test('returns a signed url for the key', async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://s/u' }, error: null });
    await expect(getContractSignedUrl('contracts/b1/signed.pdf')).resolves.toBe('https://s/u');
    expect(createSignedUrl).toHaveBeenCalledWith('contracts/b1/signed.pdf', 3600);
  });

  test('passes custom expiry and throws on error / missing url', async () => {
    createSignedUrl.mockResolvedValueOnce({ data: { signedUrl: 'u' }, error: null });
    await getContractSignedUrl('k', 60);
    expect(createSignedUrl).toHaveBeenCalledWith('k', 60);
    createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'nope' } });
    await expect(getContractSignedUrl('k')).rejects.toThrow(/nope/);
    createSignedUrl.mockResolvedValueOnce({ data: null, error: null });
    await expect(getContractSignedUrl('k')).rejects.toThrow();
  });
});
