'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';

/**
 * Right-side brand panel of the V2 asymmetric homepage hero.
 * Main wordmark cycles through the supported scripts on a 2.5s loop with
 * crossfade. Glyph row at the bottom remains static for at-a-glance reference.
 * Reduce-motion: locks to the first script (Devanagari), no interval, no
 * crossfade. The transition-opacity classes remain inert because the
 * static index never changes.
 */

const SCRIPTS = [
  {
    label: 'Devanagari',
    text: 'बाज़ार',
    font: 'var(--font-wordmark-deva), serif',
  },
  {
    label: 'Nastaliq',
    text: 'بازار',
    font: 'var(--font-wordmark-nastaliq), serif',
  },
  {
    label: 'Naskh',
    text: 'بازار',
    font: 'var(--font-wordmark-naskh), serif',
  },
  {
    label: 'Persian',
    text: 'بازار',
    font: 'var(--font-wordmark-persian), serif',
  },
] as const;

const CYCLE_MS = 2500;

export function HomepageWordmarkPanel() {
  const [index, setIndex] = useState(0);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % SCRIPTS.length);
    }, CYCLE_MS);
    return () => window.clearInterval(id);
  }, [prefersReducedMotion]);

  const current = SCRIPTS[index];

  // Reduced motion: skip the first-mount stagger entirely — render content
  // statically. Tokens identical so layout doesn't shift.
  const stagger = (delay: number) =>
    prefersReducedMotion
      ? undefined
      : {
          type: 'spring' as const,
          duration: 0.3,
          bounce: 0,
          delay,
        };
  const motionInitial = prefersReducedMotion ? false : { opacity: 0, y: 8 };
  const motionAnimate = prefersReducedMotion ? undefined : { opacity: 1, y: 0 };

  return (
    <div className="relative hidden border-l border-hairline pl-16 lg:block">
      <motion.p
        className="m-0 mb-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft"
        initial={motionInitial}
        animate={motionAnimate}
        transition={stagger(0)}
      >
        MADE IN <span className="text-haldi">CHICAGO</span>
      </motion.p>

      {/* Cycling wordmark — stacked positions so each script fades in over the previous */}
      <motion.div
        className="relative"
        style={{ fontSize: 'clamp(72px, 9vw, 130px)', minHeight: '0.85em', lineHeight: '0.85' }}
        aria-label="Baazar"
        translate="no"
        initial={motionInitial}
        animate={motionAnimate}
        transition={stagger(0.1)}
      >
        {SCRIPTS.map((s, i) => (
          <h2
            key={s.label}
            aria-hidden="true"
            className={`duration-[600ms] absolute left-0 top-0 m-0 tracking-[-0.03em] text-ink transition-opacity ${
              i === index ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              fontFamily: s.font,
              fontSize: 'inherit',
              fontWeight: 400,
              lineHeight: 'inherit',
            }}
          >
            <span>{s.text}</span>
            <span className="text-hot-pink">.</span>
          </h2>
        ))}
      </motion.div>

      <motion.div
        className="mt-5 flex items-baseline gap-4"
        aria-label="Scripts"
        initial={motionInitial}
        animate={motionAnimate}
        transition={stagger(0.2)}
      >
        {SCRIPTS.map((s, i) => (
          <span
            key={s.label}
            title={s.label}
            className={`text-base leading-none transition-colors duration-300 ${
              i === index ? 'font-semibold text-ink' : 'text-ink-soft'
            }`}
            style={{ fontFamily: s.font }}
          >
            {s.text}
          </span>
        ))}
      </motion.div>
    </div>
  );
}
