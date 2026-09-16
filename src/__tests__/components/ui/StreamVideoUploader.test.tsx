import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StreamVideoUploader } from '@/components/ui/StreamVideoUploader';

function videoFile(name: string, sizeMb = 5): File {
  const f = new File([], name, { type: 'video/mp4' });
  Object.defineProperty(f, 'size', { value: sizeMb * 1024 * 1024 });
  return f;
}

const OLD_ENV = { ...process.env };

beforeEach(() => {
  // streamThumbnailUrl (used by the manage grid) reads this at render time.
  process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN = 'customer-test';
  // direct-upload -> uploadURL+uid ; PUT/POST upload -> ok ; status -> ready
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url.endsWith('/api/stream/direct-upload')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ uploadURL: 'https://up.cf/x', uid: 'vid-1' }),
      });
    }
    if (url === 'https://up.cf/x') {
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }
    if (url.includes('/api/stream/status/')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ uid: 'vid-1', readyToStream: true }),
      });
    }
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  process.env = { ...OLD_ENV };
  vi.restoreAllMocks();
});

it('uploads a clip and calls onChange with the new uid once ready', async () => {
  const onChange = vi.fn();
  render(<StreamVideoUploader value={[]} onChange={onChange} maxClips={3} />);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [videoFile('clip.mp4')] } });

  await waitFor(() => expect(onChange).toHaveBeenCalledWith(['vid-1']));
});

it('blocks selection past maxClips with a visible notice and no upload', async () => {
  const onChange = vi.fn();
  render(<StreamVideoUploader value={['a', 'b', 'c']} onChange={onChange} maxClips={3} />);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [videoFile('extra.mp4')] } });

  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});
