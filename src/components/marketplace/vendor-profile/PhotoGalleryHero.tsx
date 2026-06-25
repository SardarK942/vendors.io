// src/components/marketplace/vendor-profile/PhotoGalleryHero.tsx
import Image from 'next/image';

interface PhotoGalleryHeroProps {
  images: string[];
  businessName: string;
}

export function PhotoGalleryHero({ images, businessName }: PhotoGalleryHeroProps) {
  if (images.length === 0) return null;
  const visible = images.slice(0, 5);
  return (
    <div
      data-testid="photo-gallery-hero"
      className="grid grid-cols-3 grid-rows-2 gap-2 overflow-hidden rounded-lg"
      style={{ aspectRatio: '16 / 9', maxHeight: 480 }}
    >
      {visible.map((img, i) => (
        <div
          key={i}
          className={`relative overflow-hidden bg-muted ${i === 0 ? 'col-span-2 row-span-2' : ''}`}
        >
          <Image
            src={img}
            alt={`${businessName} portfolio ${i + 1}`}
            fill
            sizes={i === 0 ? '(max-width: 768px) 100vw, 60vw' : '20vw'}
            className="object-cover"
            loading="lazy"
          />
        </div>
      ))}
    </div>
  );
}
