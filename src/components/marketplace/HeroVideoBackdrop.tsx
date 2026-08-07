'use client';

import { useEffect, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

/**
 * Full-bleed autoplaying video backdrop for the homepage hero (Figma frame
 * 113:86 direction). Muted + looped + inline so it autoplays on all browsers,
 * with a poster frame for the loading state. Honors prefers-reduced-motion by
 * showing the static poster instead of the moving video. A dark scrim keeps the
 * overlaid hero text readable. Client island so the parent hero can stay a
 * server component.
 *
 * Parallax: the media layer drifts down slightly slower than the page as the
 * hero scrolls out, for depth. The layer is over-scanned (130% tall, offset up
 * 15%) so the drift never exposes an edge. Disabled under reduced-motion.
 */
export function HeroVideoBackdrop() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Track window scroll directly (robust — the hero sits at the top of the page).
  // Small drift (12vh) so the media barely lags the page → subtle parallax with
  // near-natural framing (only ~14% over-scan → minimal zoom). vh units keep it
  // proportional across viewport heights; bounded to the top over-scan → no gap.
  const { scrollY } = useScroll();
  const yRaw = useTransform(scrollY, [0, 700], ['0vh', '12vh']);

  return (
    <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden bg-ink">
      <motion.div
        style={{ y: reducedMotion ? 0 : yRaw }}
        className="absolute inset-x-0 top-[-14%] h-[116%] will-change-transform"
      >
        {reducedMotion ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/hero/hero-poster.jpg" alt="" className="h-full w-full object-cover" />
        ) : (
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster="/hero/hero-poster.jpg"
            className="h-full w-full object-cover"
          >
            <source src="/hero/hero.mp4" type="video/mp4" />
          </video>
        )}
      </motion.div>

      {/* Scrim — left-weighted for the text column + a base darken for contrast.
          Stays fixed to the frame (not parallaxed) so text contrast is stable. */}
      <div className="absolute inset-0 bg-gradient-to-r from-ink/85 via-ink/60 to-ink/25" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-ink/25" />
    </div>
  );
}
