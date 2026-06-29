'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { Heart } from 'lucide-react';
import { useSavedVendors } from '@/components/marketplace/SavedVendorsProvider';

interface PhotoCarouselHeroProps {
  images: string[];
  businessName: string;
  vendorId: string;
  interactive: boolean;
}

export function PhotoCarouselHero({
  images,
  businessName,
  vendorId,
  interactive,
}: PhotoCarouselHeroProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const { savedIds, toggle } = useSavedVendors();
  const isSaved = savedIds.has(vendorId);

  if (images.length === 0) return null;

  function handleScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActiveIdx(idx);
  }

  async function handleHeart(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!interactive) return;
    await toggle(vendorId);
  }

  return (
    <div data-testid="photo-carousel-hero" className="relative h-[220px] w-full overflow-hidden">
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex h-full snap-x snap-mandatory overflow-x-auto scroll-smooth motion-reduce:scroll-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        {images.map((img, i) => (
          <div key={i} className="relative h-full w-full shrink-0 snap-start">
            <Image
              src={img}
              alt={`${businessName} portfolio ${i + 1}`}
              fill
              sizes="100vw"
              className="object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
              priority={i === 0}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleHeart}
        disabled={!interactive}
        aria-label={isSaved ? 'Unsave vendor' : 'Save vendor'}
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-ink/70 backdrop-blur transition-[transform,background-color] hover:bg-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream active:scale-[0.96] motion-reduce:active:scale-100"
      >
        <Heart
          className={`h-4 w-4 ${isSaved ? 'fill-red-500 text-red-500' : 'text-white'}`}
          aria-hidden="true"
        />
      </button>

      <div
        className="absolute bottom-3 right-3 rounded-md bg-ink/70 px-2 py-1 text-xs text-cream"
        aria-live="polite"
        aria-atomic="true"
      >
        {activeIdx + 1}
        {' '}/ {images.length}
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
