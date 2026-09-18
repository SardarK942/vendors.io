'use client';

import Image from 'next/image';
import { streamThumbnailUrl } from '@/lib/cloudflare-stream';
import type { MediaItem } from '@/lib/portfolio-media';

interface PhotoGalleryHeroProps {
  media: MediaItem[];
  businessName: string;
  /** Open the lightbox at the given index. */
  onOpen?: (index: number) => void;
}

/**
 * Desktop portfolio grid — shows EVERY uploaded photo and video clip (first
 * item featured 2x2), each tile clickable to open the shared lightbox. Mobile
 * uses the swipe carousel (PhotoCarouselHero); both cover the full set, photos
 * first then clips (see mergePortfolioMedia).
 */
export function PhotoGalleryHero({ media, businessName, onOpen }: PhotoGalleryHeroProps) {
  if (media.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-2 lg:grid-cols-4" data-testid="photo-gallery-hero">
      {media.map((item, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onOpen?.(i)}
          aria-label={`View ${businessName} ${item.type === 'video' ? 'clip' : 'photo'} ${i + 1} of ${media.length}`}
          className={`group relative aspect-square cursor-zoom-in overflow-hidden rounded-lg bg-cream-soft focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream ${
            i === 0 ? 'col-span-2 row-span-2' : ''
          }`}
        >
          {item.type === 'video' ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- CF thumbnail */}
              <img
                src={streamThumbnailUrl(item.uid)}
                alt=""
                loading="lazy"
                className="ease-[cubic-bezier(.22,1,.36,1)] h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:group-hover:scale-100"
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
              sizes={i === 0 ? '(max-width: 1024px) 66vw, 50vw' : '(max-width: 1024px) 33vw, 25vw'}
              className="ease-[cubic-bezier(.22,1,.36,1)] object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:group-hover:scale-100"
              loading={i === 0 ? 'eager' : 'lazy'}
            />
          )}
        </button>
      ))}
    </div>
  );
}
