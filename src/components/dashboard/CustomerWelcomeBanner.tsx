'use client';

import * as React from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';

interface Props {
  eventDate: string | null;
  categories: string[];
  daysUntilEvent: number | null;
  formattedEventDate: string | null;
}

export function CustomerWelcomeBanner({
  eventDate,
  categories,
  daysUntilEvent,
  formattedEventDate,
}: Props): React.JSX.Element {
  // `show` drives the exit animation; `removed` fully unmounts the wrapper
  // after the animation completes so the dismissed banner takes zero layout
  // space (no residual margin).
  const [show, setShow] = React.useState(true);
  const [removed, setRemoved] = React.useState(false);
  const reducedMotion = useReducedMotion();
  const spring = reducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, duration: 0.3, bounce: 0 };
  const exitTransition = reducedMotion ? { duration: 0 } : { duration: 0.18 };

  async function handleDismiss() {
    setShow(false);
    await fetch('/api/users/me/dismiss-welcome', { method: 'PATCH' }).catch(() => {});
  }

  if (removed) return <></>;

  return (
    <AnimatePresence initial={false} onExitComplete={() => setRemoved(true)}>
      {show && (
        <motion.div
          className="mb-6 rounded-lg bg-cream p-6 shadow-[0_1px_0_rgba(0,0,0,0.04),0_4px_12px_-4px_rgba(0,0,0,0.06)]"
          role="region"
          aria-label="Welcome"
          aria-live="polite"
          exit={{ opacity: 0, y: -8, transition: exitTransition }}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              {eventDate && formattedEventDate && daysUntilEvent !== null && (
                <motion.p
                  className="text-balance text-lg font-semibold text-ink"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={spring}
                >
                  Your event is on {formattedEventDate} — that’s {daysUntilEvent} days away.
                </motion.p>
              )}

              {categories.length > 0 && (
                <motion.div
                  className="mt-3 flex flex-wrap gap-2"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring, delay: reducedMotion ? 0 : 0.1 }}
                >
                  {categories.map((c) => (
                    <Link
                      key={c}
                      href={`/vendors?category=${c}`}
                      aria-label={`Browse ${c} vendors`}
                      className="rounded-full border border-ink/20 px-3 py-1 text-xs text-ink transition-colors hover-pink-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
                    >
                      Browse {c}
                    </Link>
                  ))}
                </motion.div>
              )}
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              className="ml-4 inline-flex size-10 items-center justify-center rounded text-ink/40 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
              aria-label="Dismiss welcome banner"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
