'use client';

import * as React from 'react';
import Image from 'next/image';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface GalleryLightboxProps {
  images: string[];
  businessName: string;
  /** Index to open at, or null when closed. */
  index: number | null;
  onClose: () => void;
  onIndexChange: (i: number) => void;
}

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Full-screen photo viewer for the vendor gallery. Ink scrim + cream chrome per
 * DESIGN.md lightbox spec. Navigate via arrows, keyboard (←/→/Esc), or swipe.
 * z-[100] so it sits above the mobile BookingBottomBar (z-50).
 */
export function GalleryLightbox({
  images,
  businessName,
  index,
  onClose,
  onIndexChange,
}: GalleryLightboxProps) {
  const reduced = useReducedMotion();
  const [dir, setDir] = React.useState(0);
  const open = index !== null;
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const count = images.length;

  const paginate = React.useCallback(
    (delta: number) => {
      if (index === null) return;
      setDir(delta);
      onIndexChange((index + delta + count) % count);
    },
    [index, count, onIndexChange]
  );

  // Keyboard + body scroll lock while open.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') paginate(1);
      else if (e.key === 'ArrowLeft') paginate(-1);
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, paginate]);

  const slide = reduced
    ? { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        enter: (d: number) => ({ x: d > 0 ? 320 : -320, opacity: 0 }),
        center: { x: 0, opacity: 1 },
        exit: (d: number) => ({ x: d > 0 ? -320 : 320, opacity: 0 }),
      };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={`${businessName} photos`}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/95 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.2, ease: EASE }}
          onClick={onClose}
        >
          {/* Counter */}
          <div className="pointer-events-none absolute left-4 top-4 font-mono text-xs tabular-nums text-cream/80">
            {(index ?? 0) + 1} / {count}
          </div>

          {/* Close */}
          <button
            ref={closeRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Close"
            className="absolute right-3 top-3 z-10 flex size-11 items-center justify-center rounded-full text-cream transition-colors hover:bg-cream/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream"
          >
            <X className="size-6" aria-hidden="true" />
          </button>

          {/* Prev / next — desktop; mobile uses swipe */}
          {count > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  paginate(-1);
                }}
                aria-label="Previous photo"
                className="absolute left-2 z-10 hidden size-12 items-center justify-center rounded-full text-cream transition-colors hover:bg-cream/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream sm:flex"
              >
                <ChevronLeft className="size-7" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  paginate(1);
                }}
                aria-label="Next photo"
                className="absolute right-2 z-10 hidden size-12 items-center justify-center rounded-full text-cream transition-colors hover:bg-cream/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream sm:flex"
              >
                <ChevronRight className="size-7" aria-hidden="true" />
              </button>
            </>
          )}

          {/* Image (swipeable) */}
          <AnimatePresence initial={false} custom={dir} mode="popLayout">
            <motion.div
              key={index}
              custom={dir}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: reduced ? 0 : 0.28, ease: EASE }}
              drag={count > 1 ? 'x' : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.85}
              onClick={(e) => e.stopPropagation()}
              onDragEnd={(_, info) => {
                if (info.offset.x < -80 || info.velocity.x < -500) paginate(1);
                else if (info.offset.x > 80 || info.velocity.x > 500) paginate(-1);
              }}
              className="absolute inset-0 flex touch-pan-y items-center justify-center p-4 sm:p-12"
            >
              <div className="relative h-full w-full">
                <Image
                  src={images[index ?? 0]}
                  alt={`${businessName} photo ${(index ?? 0) + 1} of ${count}`}
                  fill
                  sizes="100vw"
                  className="select-none object-contain"
                  draggable={false}
                  priority
                />
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
