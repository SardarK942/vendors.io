'use client';

import { useEffect, useState } from 'react';

/**
 * Full-bleed autoplaying video backdrop for the homepage hero (Figma frame
 * 113:86 direction). Muted + looped + inline so it autoplays on all browsers,
 * with a poster frame for the loading state. Honors prefers-reduced-motion by
 * showing the static poster instead of the moving video. A dark scrim keeps the
 * overlaid hero text readable. Client island so the parent hero can stay a
 * server component.
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

  return (
    <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden bg-ink">
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

      {/* Scrim — left-weighted for the text column + a base darken for contrast. */}
      <div className="absolute inset-0 bg-gradient-to-r from-ink/85 via-ink/60 to-ink/25" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-ink/25" />
    </div>
  );
}
