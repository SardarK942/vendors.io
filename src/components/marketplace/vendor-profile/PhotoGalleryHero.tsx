'use client';

import Image from 'next/image';

interface PhotoGalleryHeroProps {
  images: string[];
  businessName: string;
  /** Open the lightbox at the given index. */
  onOpen?: (index: number) => void;
}

export function PhotoGalleryHero({ images, businessName, onOpen }: PhotoGalleryHeroProps) {
  if (images.length === 0) return null;
  const visible = images.slice(0, 5);
  const extra = images.length - visible.length;

  return (
    <div
      data-testid="photo-gallery-hero"
      className="grid grid-cols-3 grid-rows-2 gap-2 overflow-hidden rounded-lg"
      style={{ aspectRatio: '16 / 9', maxHeight: 480 }}
    >
      {visible.map((img, i) => {
        const isLast = i === visible.length - 1;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onOpen?.(i)}
            aria-label={`View ${businessName} photo ${i + 1} of ${images.length}`}
            className={`group relative cursor-zoom-in overflow-hidden bg-cream-soft focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream ${
              i === 0 ? 'col-span-2 row-span-2' : ''
            }`}
          >
            <Image
              src={img}
              alt={`${businessName} portfolio ${i + 1}`}
              fill
              sizes={i === 0 ? '(max-width: 768px) 100vw, 60vw' : '20vw'}
              className="object-cover transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-[1.03] motion-reduce:group-hover:scale-100"
              loading={i === 0 ? 'eager' : 'lazy'}
            />
            {isLast && extra > 0 && (
              <span className="absolute inset-0 flex items-center justify-center bg-ink/55 text-lg font-semibold text-cream backdrop-blur-[1px]">
                +{extra} photos
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
