'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, X } from 'lucide-react';

/**
 * Explains why a returning claimer landed here. The claim page redirects an
 * already-claimed owner to their profile with `?claimed=resumed` (onboarding
 * unfinished) or `?claimed=live` (already published); this reads that flag,
 * shows a top bar, and strips the param so a refresh doesn't re-show it.
 */
const MESSAGES: Record<string, string> = {
  resumed:
    'You’ve already claimed this profile. Here’s where you left off. Finish up and publish whenever you’re ready.',
  live: 'You’ve already claimed this profile, and it’s live. You can edit it anytime.',
};

export function ClaimResumeBanner() {
  const params = useSearchParams();
  const [variant, setVariant] = useState<string | null>(null);

  useEffect(() => {
    const claimed = params.get('claimed');
    if (claimed && MESSAGES[claimed]) {
      setVariant(claimed);
      // Strip the flag from the URL without a router navigation — a soft
      // navigation would re-render this component and drop the banner.
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('claimed');
        window.history.replaceState(
          window.history.state,
          '',
          `${url.pathname}${url.search}${url.hash}`
        );
      } catch {
        // history unavailable (SSR/edge) — the banner still shows.
      }
    }
    // Run once on mount: the param is read and then stripped from the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!variant) return null;

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-lg border border-indigo/25 bg-indigo/10 px-4 py-3 text-sm text-ink"
    >
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo text-cream">
        <Check className="h-3 w-3" strokeWidth={2.5} />
      </span>
      <p className="flex-1 text-pretty">{MESSAGES[variant]}</p>
      <button
        type="button"
        onClick={() => setVariant(null)}
        aria-label="Dismiss"
        className="shrink-0 rounded p-0.5 text-ink-soft transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
