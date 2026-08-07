'use client';

import { useEffect, useState } from 'react';

export interface RotatingWordProps {
  /** Words to cycle through. The first is the static fallback for screen readers. */
  words: string[];
  /** Milliseconds each word is held before swapping. */
  interval?: number;
  className?: string;
}

/**
 * Cross-fades through a list of words in place. The rotating text is visual only
 * (aria-hidden); a screen-reader-only static copy of the first word keeps the
 * headline readable and stable for assistive tech. Honors prefers-reduced-motion
 * by rendering the first word without animation.
 *
 * Used for the homepage hero headline ("Planning your [rotating] starts here.")
 * per docs/superpowers/specs/2026-08-04-homepage-signup-redesign-design.md (H1).
 */
export function RotatingWord({ words, interval = 2200, className }: RotatingWordProps) {
  const [index, setIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (reducedMotion || words.length < 2) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % words.length);
    }, interval);
    return () => window.clearInterval(id);
  }, [reducedMotion, words.length, interval]);

  const current = reducedMotion ? words[0] : words[index];

  return (
    <span className="relative inline-block align-baseline">
      {/* Reserve width for the longest word so the line doesn't reflow on swap. */}
      <span aria-hidden className="invisible whitespace-nowrap">
        {words.reduce((a, b) => (b.length > a.length ? b : a), '')}
      </span>
      <span
        key={current}
        aria-hidden
        className={
          'absolute inset-0 whitespace-nowrap transition-opacity duration-500 ease-out ' +
          (reducedMotion ? '' : 'animate-in fade-in ') +
          (className ?? '')
        }
      >
        {current}
      </span>
      {/* Stable, non-animated copy for assistive tech. Leading space guarantees
          word separation in the computed accessible name (…your dream wedding…). */}
      <span className="sr-only">
        {' '}
        {words[0]}
      </span>
    </span>
  );
}
