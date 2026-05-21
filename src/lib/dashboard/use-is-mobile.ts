'use client';

import { useEffect, useState } from 'react';

const BREAKPOINT_QUERY = '(max-width: 767px)';

/**
 * Returns true on viewports < md (mobile). SSR-safe: returns false during SSR and the
 * first client render, then resolves correctly after mount. Components depending on this
 * must tolerate a one-render mismatch (typical pattern: render desktop, then redirect in
 * useEffect once isMobile is true).
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(BREAKPOINT_QUERY);
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
