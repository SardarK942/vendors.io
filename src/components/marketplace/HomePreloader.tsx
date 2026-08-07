'use client';

import { useEffect, useState } from 'react';
import { WORDMARK_SCRIPTS } from '@/components/layout/footer/wordmark-cycle-helpers';

/**
 * Site preloader — PL-A ("accelerated wordmark cycle") per DESIGN.md §500.
 *
 * First paint shows the multi-cultural baazar wordmark cycling fast (≈600ms per
 * script, 200ms crossfades, ~1.5s total) with a haldi hairline filling
 * left-to-right (scaleX, never width) as a progress indicator. Then the overlay
 * lifts to reveal the page; the wordmark continues at its normal cadence in the
 * hero flipper + footer. Shows once per browser session (sessionStorage) so it
 * doesn't replay on client navigations. Reduced motion: a static script + a
 * filled hairline, brief hold, then reveal.
 */
const SESSION_KEY = 'baazar:preloaded';
const CYCLE_MS = 640; // accelerated tempo (vs the locked 3.5s hold)
const FADE_MS = 200;
const HOLD_MS = 1600; // total brand moment before the reveal
const EXIT_MS = 550;

export function HomePreloader() {
  const [phase, setPhase] = useState<'loading' | 'exiting' | 'done'>('loading');
  const [index, setIndex] = useState(0);
  const [opacity, setOpacity] = useState(1);
  const [fill, setFill] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Skip entirely if we've already shown it this session.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(SESSION_KEY)) {
      setPhase('done');
      return;
    }

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReducedMotion(reduce);

    // Kick the haldi progress fill on the next frame so the transition runs.
    const raf = requestAnimationFrame(() => setFill(true));

    let cycle: ReturnType<typeof setInterval> | null = null;
    let swap: ReturnType<typeof setTimeout> | null = null;
    if (!reduce) {
      cycle = setInterval(() => {
        setOpacity(0);
        swap = setTimeout(() => {
          setIndex((i) => (i + 1) % WORDMARK_SCRIPTS.length);
          setOpacity(1);
        }, FADE_MS);
      }, CYCLE_MS);
    }

    const hold = setTimeout(() => setPhase('exiting'), HOLD_MS);
    const finish = setTimeout(() => {
      // Mark done only on completion so StrictMode's double-invoked effect (dev)
      // doesn't set the flag on the first pass and then hide itself on the second.
      sessionStorage.setItem(SESSION_KEY, '1');
      setPhase('done');
    }, HOLD_MS + EXIT_MS);

    return () => {
      cancelAnimationFrame(raf);
      if (cycle) clearInterval(cycle);
      if (swap) clearTimeout(swap);
      clearTimeout(hold);
      clearTimeout(finish);
    };
  }, []);

  if (phase === 'done') return null;

  const script = WORDMARK_SCRIPTS[index];

  return (
    <div
      aria-hidden="true"
      className={
        'fixed inset-0 z-[200] flex flex-col items-center justify-center gap-9 bg-cream ' +
        'ease-[cubic-bezier(0.22,1,0.36,1)] transition-[opacity,transform] ' +
        (phase === 'exiting'
          ? 'pointer-events-none -translate-y-3 opacity-0'
          : 'translate-y-0 opacity-100')
      }
      style={{ transitionDuration: `${EXIT_MS}ms` }}
    >
      {/* Cycling multi-script wordmark */}
      <div
        className="leading-none tracking-[-0.03em] text-ink"
        style={{ fontSize: 'clamp(72px, 15vw, 168px)' }}
      >
        <span
          className="inline-block transition-opacity"
          style={{
            opacity: reducedMotion ? 1 : opacity,
            transitionDuration: `${FADE_MS}ms`,
            fontFamily: script.cssFamily,
            fontSize: `${script.scaleMultiplier}em`,
          }}
        >
          {script.glyph}
          <span className="text-hot-pink">.</span>
        </span>
      </div>

      {/* Haldi hairline progress (scaleX, never width) */}
      <div className="h-px w-[min(280px,56vw)] overflow-hidden bg-ink/10">
        <div
          className="h-full w-full origin-left bg-haldi"
          style={{
            transform: `scaleX(${reducedMotion ? 1 : fill ? 1 : 0})`,
            transition: reducedMotion
              ? 'none'
              : `transform ${HOLD_MS}ms cubic-bezier(0.22,1,0.36,1)`,
          }}
        />
      </div>

      {/* Latin brand anchor */}
      <p className="m-0 font-serif text-sm lowercase tracking-[0.02em] text-ink/55">
        baazar<span className="text-hot-pink">.</span>
      </p>
    </div>
  );
}
