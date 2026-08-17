'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';

interface PhotoCarouselHeroProps {
  images: string[];
  businessName: string;
  /** Open the lightbox at the given index. */
  onOpen?: (index: number) => void;
  // Retained for call-site compatibility; save now lives on VendorHero.
  vendorId?: string;
  interactive?: boolean;
}

export function PhotoCarouselHero({ images, businessName, onOpen }: PhotoCarouselHeroProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  if (images.length === 0) return null;

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
        {images.map((img, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onOpen?.(i)}
            aria-label={`View ${businessName} photo ${i + 1} of ${images.length}`}
            className="relative h-full w-full shrink-0 cursor-zoom-in snap-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cream"
          >
            <Image
              src={img}
              alt={`${businessName} portfolio ${i + 1}`}
              fill
              sizes="100vw"
              className="object-cover"
              priority={i === 0}
            />
          </button>
        ))}
      </div>

      <div
        className="absolute bottom-3 right-3 rounded-md bg-ink/70 px-2 py-1 text-xs text-cream"
        aria-live="polite"
        aria-atomic="true"
      >
        {activeIdx + 1} / {images.length}
      </div>

      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
        {images.map((_, i) => (
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
