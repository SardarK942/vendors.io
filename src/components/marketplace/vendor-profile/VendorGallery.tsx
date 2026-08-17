'use client';

import * as React from 'react';
import { PhotoGalleryHero } from './PhotoGalleryHero';
import { PhotoCarouselHero } from './PhotoCarouselHero';
import { GalleryLightbox } from './GalleryLightbox';

interface VendorGalleryProps {
  images: string[];
  businessName: string;
}

/**
 * The vendor portfolio gallery: responsive display surfaces (mobile swipe
 * carousel + desktop mosaic) that both open a shared full-screen lightbox at the
 * tapped photo. Matches the DESIGN.md three-surface gallery composition.
 */
export function VendorGallery({ images, businessName }: VendorGalleryProps) {
  const [index, setIndex] = React.useState<number | null>(null);
  if (images.length === 0) return null;

  return (
    <>
      <div className="md:hidden">
        <PhotoCarouselHero images={images} businessName={businessName} onOpen={setIndex} />
      </div>
      <div className="hidden md:block">
        <PhotoGalleryHero images={images} businessName={businessName} onOpen={setIndex} />
      </div>
      <GalleryLightbox
        images={images}
        businessName={businessName}
        index={index}
        onClose={() => setIndex(null)}
        onIndexChange={setIndex}
      />
    </>
  );
}
