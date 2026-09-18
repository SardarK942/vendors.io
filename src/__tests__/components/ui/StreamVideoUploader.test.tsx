import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StreamVideoUploader } from '@/components/ui/StreamVideoUploader';

function videoFile(name: string, sizeMb = 5): File {
  const f = new File([], name, { type: 'video/mp4' });
  Object.defineProperty(f, 'size', { value: sizeMb * 1024 * 1024 });
  return f;
}

const OLD_ENV = { ...process.env };

// The file upload leg uses XMLHttpRequest (for real progress); mock it so send()
// reports 100% and completes 200.
class MockXHR {
  upload: {
    onprogress: null | ((e: { lengthComputable: boolean; loaded: number; total: number }) => void);
  } = {
    onprogress: null,
  };
  onload: null | (() => void) = null;
  onerror: null | (() => void) = null;
  status = 200;
  open() {}
  send() {
    this.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 1 });
    this.onload?.();
  }
}

beforeEach(() => {
  // streamThumbnailUrl (used by the manage grid) reads this at render time.
  process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN = 'customer-test';
  vi.stubGlobal('XMLHttpRequest', MockXHR);
  // direct-upload -> uploadURL+uid ; status -> ready (the file upload goes via XHR)
  const fetchMock = vi.fn((url: string) => {
    if (url.endsWith('/api/stream/direct-upload')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ uploadURL: 'https://up.cf/x', uid: 'vid-1' }),
      });
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
