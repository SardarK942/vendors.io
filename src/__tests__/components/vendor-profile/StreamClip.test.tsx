import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { StreamClip } from '@/components/marketplace/vendor-profile/StreamClip';

const OLD = { ...process.env };
beforeEach(() => {
  process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN = 'customer-test';
});
afterEach(() => {
  process.env = { ...OLD };
  vi.restoreAllMocks();
});

describe('<StreamClip />', () => {
  it('renders an iframe pointing at the Cloudflare Stream embed for the uid', () => {
    const { container } = render(<StreamClip uid="abc123" title="Mandap reveal" />);
    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('src')).toBe(
      'https://customer-test.cloudflarestream.com/abc123/iframe'
    );
    expect(iframe?.getAttribute('allowfullscreen')).not.toBeNull();
  });
});
