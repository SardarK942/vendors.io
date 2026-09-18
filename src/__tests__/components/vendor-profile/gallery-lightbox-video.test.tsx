// src/__tests__/components/vendor-profile/gallery-lightbox-video.test.tsx
import * as React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { GalleryLightbox } from '@/components/marketplace/vendor-profile/GalleryLightbox';
import type { MediaItem } from '@/lib/portfolio-media';

// next/image needs a real DOM element in jsdom; a plain <img> preserving src/alt
// is enough to assert what URL the lightbox handed it.
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

// framer-motion's AnimatePresence/motion.div do real exit-animation bookkeeping
// that doesn't resolve synchronously in jsdom, and useReducedMotion reads
// window.matchMedia (absent in jsdom). Collapse both to plain passthroughs so the
// active slide renders immediately and deterministically.
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    div: React.forwardRef<HTMLDivElement, any>(function MotionDiv(
      {
        children,
        variants,
        initial,
        animate,
        exit,
        custom,
        transition,
        drag,
        dragConstraints,
        dragElastic,
        onDragEnd,
        ...rest
      },
      ref
    ) {
      return (
        <div ref={ref} {...rest}>
          {children}
        </div>
      );
    }),
  },
  useReducedMotion: () => true,
}));

const OLD_ENV = { ...process.env };

beforeEach(() => {
  process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN = 'customer-test';
});

afterEach(() => {
  process.env = { ...OLD_ENV };
  vi.restoreAllMocks();
});

const media: MediaItem[] = [
  { type: 'image', url: 'https://example.com/photo-1.jpg' },
  { type: 'video', uid: 'abc123def456' },
];

describe('<GalleryLightbox />', () => {
  it('renders the StreamClip iframe when the active slide is a video', () => {
    const { container } = render(
      <GalleryLightbox
        media={media}
        businessName="Priya Events"
        index={1}
        onClose={vi.fn()}
        onIndexChange={vi.fn()}
      />
    );

    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('src')).toContain('cloudflarestream.com/abc123def456/iframe');
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders an image, not an iframe, when the active slide is a photo', () => {
    const { container } = render(
      <GalleryLightbox
        media={media}
        businessName="Priya Events"
        index={0}
        onClose={vi.fn()}
        onIndexChange={vi.fn()}
      />
    );

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://example.com/photo-1.jpg');
    expect(container.querySelector('iframe')).toBeNull();
  });
});
