'use client';

import { useEffect, useState } from 'react';

/**
 * Returns true when the user has system-level Reduce Motion enabled.
 * SSR-safe: defaults to `false` on the server, syncs to the real value
 * after mount via matchMedia.
 */
export function usePrefersReducedMotion() {
  const [prefers, setPrefers] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefers(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setPrefers(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return prefers;
}
