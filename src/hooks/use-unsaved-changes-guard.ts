'use client';

import { useEffect } from 'react';

/**
 * Browser-level guard against losing unsaved form work.
 *
 * When `isDirty=true`, attaches a `beforeunload` listener so the browser shows
 * its native "Leave site? Changes you made may not be saved." prompt on:
 *   - closing the tab
 *   - refreshing the page
 *   - typing a new URL in the address bar
 *   - browser back/forward to a different origin
 *
 * NOT covered (intentional, would require app-level router interception):
 *   - Next.js client-side navigation (router.push from inside the app)
 *   - Anchor clicks to in-app routes that resolve to Link prefetch
 *
 * Returns nothing — the side-effect is purely the listener attach/detach.
 *
 * Usage:
 *   const isDirty = JSON.stringify(data) !== JSON.stringify(initial);
 *   useUnsavedChangesGuard(isDirty);
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      // Modern browsers ignore the returned message and show their own
      // generic prompt, but Chromium-based browsers still require
      // preventDefault() + returnValue set in order to fire the prompt.
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);
}
