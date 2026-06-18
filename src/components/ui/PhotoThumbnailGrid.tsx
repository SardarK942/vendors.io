'use client';
import { Star, X } from 'lucide-react';

interface Props {
  urls: string[];
  showPrimarySelector?: boolean;
  onRemove: (idx: number) => void;
  onSetPrimary: (idx: number) => void;
}

export function PhotoThumbnailGrid({ urls, showPrimarySelector, onRemove, onSetPrimary }: Props) {
  if (urls.length === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-3">
      {urls.map((url, i) => (
        <div
          key={`${url}-${i}`}
          className="group relative aspect-square overflow-hidden rounded-md"
        >
          <img src={url} alt="" className="h-full w-full object-cover" />
          {showPrimarySelector && i === 0 && (
            <span className="absolute left-1 top-1 rounded-full bg-hot-pink px-2 py-0.5 text-[10px] font-medium text-cream">
              Primary
            </span>
          )}
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-ink/60 opacity-0 transition-opacity group-hover:opacity-100">
            {showPrimarySelector && i !== 0 && (
              <button
                type="button"
                onClick={() => onSetPrimary(i)}
                aria-label="Set as primary"
                className="rounded-full bg-cream p-2 text-ink hover:bg-cream/80"
              >
                <Star className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onRemove(i)}
              aria-label="Remove photo"
              className="rounded-full bg-cream p-2 text-hot-pink hover:bg-cream/80"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
