'use client';

import Image from 'next/image';

interface PhotoGalleryHeroProps {
  images: string[];
  businessName: string;
  /** Open the lightbox at the given index. */
  onOpen?: (index: number) => void;
}

/**
 * Desktop portfolio grid — shows EVERY uploaded photo (first one featured 2x2),
 * each tile clickable to open the shared lightbox. Mobile uses the swipe
 * carousel (PhotoCarouselHero); both cover the full set.
 */
export function PhotoGalleryHero({ images, businessName, onOpen }: PhotoGalleryHeroProps) {
  if (images.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-2 lg:grid-cols-4" data-testid="photo-gallery-hero">
      {images.map((img, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onOpen?.(i)}
          aria-label={`View ${businessName} photo ${i + 1} of ${images.length}`}
          className={`group relative aspect-square cursor-zoom-in overflow-hidden rounded-lg bg-cream-soft focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream ${
            i === 0 ? 'col-span-2 row-span-2' : ''
          }`}
        >
          <Image
            src={img}
            alt={`${businessName} portfolio ${i + 1}`}
            fill
            sizes={i === 0 ? '(max-width: 1024px) 66vw, 50vw' : '(max-width: 1024px) 33vw, 25vw'}
            className="object-cover transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-[1.03] motion-reduce:group-hover:scale-100"
            loading={i === 0 ? 'eager' : 'lazy'}
          />
        </button>
      ))}
    </div>
  );
}
