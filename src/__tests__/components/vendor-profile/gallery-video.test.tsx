import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PhotoGalleryHero } from '@/components/marketplace/vendor-profile/PhotoGalleryHero';
import type { MediaItem } from '@/lib/portfolio-media';

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

const OLD = { ...process.env };
beforeEach(() => {
  process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN = 'customer-test';
});
afterEach(() => {
  process.env = { ...OLD };
  vi.restoreAllMocks();
});

describe('<PhotoGalleryHero /> with video items', () => {
  it('renders a play affordance on video items and a button per item', () => {
    const media: MediaItem[] = [
      { type: 'image', url: 'https://x/p1.jpg' },
      { type: 'video', uid: 'vid1' },
    ];
    render(<PhotoGalleryHero media={media} businessName="Priya" onOpen={() => {}} />);
    // one open button per media item
    expect(screen.getAllByRole('button')).toHaveLength(2);
    // the video item pulls the CF thumbnail
    const thumb = document.querySelector('img[src*="customer-test.cloudflarestream.com/vid1"]');
    expect(thumb).not.toBeNull();
  });
});
