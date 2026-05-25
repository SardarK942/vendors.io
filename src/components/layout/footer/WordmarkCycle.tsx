'use client';

import * as React from 'react';
import { WORDMARK_SCRIPTS, nextScriptIndex } from './wordmark-cycle-helpers';

const HOLD_MS = 3500; // motion.cycle-hold
const FADE_MS = 400; // motion.cycle-fade

export interface WordmarkCycleProps {
  /** Tailwind sizing classes for the outer wrapper. Defaults to footer-band scale. */
  className?: string;
}

/**
 * Cycles "baazar" through Devanagari → Nastaliq → Naskh → Persian on a
 * 3.5s hold + 400ms crossfade. Pauses when offscreen (IntersectionObserver)
 * and when prefers-reduced-motion is set (stays on Devanagari).
 *
 * Renders Devanagari statically on the server; the cycle starts after hydration.
 */
export function WordmarkCycle({ className }: WordmarkCycleProps) {
  const [index, setIndex] = React.useState(0);
  const [opacity, setOpacity] = React.useState(1);
  const wrapperRef = React.useRef<HTMLHeadingElement | null>(null);
  const visibleRef = React.useRef(false);

  React.useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const el = wrapperRef.current;
    if (!el) return;

    let interval: ReturnType<typeof setInterval> | null = null;
    let fadeTimeout: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      if (!visibleRef.current) return;
      setOpacity(0);
      fadeTimeout = setTimeout(() => {
        setIndex((prev) => nextScriptIndex(prev));
        setOpacity(1);
      }, FADE_MS);
    };

    const start = () => {
      if (interval) return;
      interval = setInterval(tick, HOLD_MS + FADE_MS);
    };
    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      if (fadeTimeout) {
        clearTimeout(fadeTimeout);
        fadeTimeout = null;
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          visibleRef.current = e.isIntersecting;
          if (e.isIntersecting) {
            setOpacity(1); // recover from any interrupted fade
            start();
          } else {
            stop();
          }
        });
      },
      { threshold: 0.1 }
    );
    io.observe(el);

    return () => {
      io.disconnect();
      stop();
    };
  }, []);

  const script = WORDMARK_SCRIPTS[index];

  return (
    <h2
      ref={wrapperRef}
      aria-label="Baazar"
      className={
        className ??
        'm-0 text-[clamp(60px,16vw,200px)] font-normal leading-[0.85] tracking-[-0.03em] text-cream'
      }
    >
      <span
        aria-hidden="true"
        className="inline-block transition-opacity"
        style={{
          opacity,
          transitionDuration: `${FADE_MS}ms`,
          transitionTimingFunction: 'cubic-bezier(.22,1,.36,1)',
          fontFamily: script.cssFamily,
          fontSize: `${script.scaleMultiplier}em`,
        }}
      >
        {script.glyph}
        <span className="text-hot-pink">.</span>
      </span>
    </h2>
  );
}
