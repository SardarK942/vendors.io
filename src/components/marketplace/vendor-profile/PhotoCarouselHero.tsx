'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { streamThumbnailUrl } from '@/lib/cloudflare-stream';
import type { MediaItem } from '@/lib/portfolio-media';

interface PhotoCarouselHeroProps {
  media: MediaItem[];
  businessName: string;
  /** Open the lightbox at the given index. */
  onOpen?: (index: number) => void;
  // Retained for call-site compatibility; save now lives on VendorHero.
  vendorId?: string;
  interactive?: boolean;
}

export function PhotoCarouselHero({ media, businessName, onOpen }: PhotoCarouselHeroProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  if (media.length === 0) return null;

  function handleScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActiveIdx(idx);
  }

  return (
    <div
      data-testid="photo-carousel-hero"
      className="relative h-[240px] w-full overflow-hidden rounded-lg"
    >
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex h-full snap-x snap-mandatory overflow-x-auto scroll-smooth motion-reduce:scroll-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        {media.map((item, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onOpen?.(i)}
            aria-label={`View ${businessName} ${item.type === 'video' ? 'clip' : 'photo'} ${i + 1} of ${media.length}`}
            className="relative h-full w-full shrink-0 cursor-zoom-in snap-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cream"
          >
            {item.type === 'video' ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- CF thumbnail */}
                <img
                  src={streamThumbnailUrl(item.uid)}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                <span aria-hidden className="absolute inset-0 grid place-items-center bg-ink/15">
                  <span className="flex size-11 items-center justify-center rounded-full bg-cream/90 text-ink">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="size-5 translate-x-px">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                </span>
              </>
            ) : (
              <Image
                src={item.url}
                alt={`${businessName} portfolio ${i + 1}`}
                fill
                sizes="100vw"
                className="object-cover"
                priority={i === 0}
              />
            )}
          </button>
        ))}
      </div>

      <div
        className="absolute bottom-3 right-3 rounded-md bg-ink/70 px-2 py-1 text-xs text-cream"
        aria-live="polite"
        aria-atomic="true"
      >
        {activeIdx + 1} / {media.length}
      </div>

      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
        {media.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 w-1.5 rounded-full transition-colors ${
              i === activeIdx ? 'bg-white' : 'bg-white/50'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
