'use client';

import * as React from 'react';
import { PhotoGalleryHero } from './PhotoGalleryHero';
import { PhotoCarouselHero } from './PhotoCarouselHero';
import { GalleryLightbox } from './GalleryLightbox';
import type { MediaItem } from '@/lib/portfolio-media';

interface VendorGalleryProps {
  media: MediaItem[];
  businessName: string;
}

/**
 * The vendor portfolio gallery: responsive display surfaces (mobile swipe
 * carousel + desktop mosaic) that both open a shared full-screen lightbox at the
 * tapped photo or clip. Matches the DESIGN.md three-surface gallery composition.
 * `media` is one ordered list (photos first, clips after — see
 * mergePortfolioMedia); every surface indexes into it so grid→lightbox stays
 * consistent.
 */
export function VendorGallery({ media, businessName }: VendorGalleryProps) {
  const [index, setIndex] = React.useState<number | null>(null);
  if (media.length === 0) return null;

  return (
    <>
      <div className="md:hidden">
        <PhotoCarouselHero media={media} businessName={businessName} onOpen={setIndex} />
      </div>
      <div className="hidden md:block">
        <PhotoGalleryHero media={media} businessName={businessName} onOpen={setIndex} />
      </div>
      <GalleryLightbox
        media={media}
        businessName={businessName}
        index={index}
        onClose={() => setIndex(null)}
        onIndexChange={setIndex}
      />
    </>
  );
}
