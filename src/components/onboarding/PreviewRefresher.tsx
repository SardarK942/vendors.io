'use client';
import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * Next.js reuses a shared layout across soft navigations between its child
 * routes, so `SetupLayout`'s server-side profile fetch would go stale as the
 * vendor advances through steps — leaving the live preview frozen.
 *
 * This island re-fetches the layout's server data (via router.refresh) whenever
 * the step path changes, which is exactly the "update on step-advance" cadence
 * the preview needs. It skips the initial mount so the first paint isn't
 * double-fetched.
 */
export function PreviewRefresher() {
  const pathname = usePathname();
  const router = useRouter();
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    router.refresh();
  }, [pathname, router]);

  return null;
}
