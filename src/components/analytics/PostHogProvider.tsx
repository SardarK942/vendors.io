'use client';
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { Suspense } from 'react';
import { PostHogPageView } from './PostHogPageView';
import { PostHogIdentify } from './PostHogIdentify';

// Init at module scope (not in a child useEffect) so posthog is loaded before
// PostHogPageView's effect runs — React fires child effects before parent
// effects, so a useEffect-based init here would drop the initial pageview.
if (typeof window !== 'undefined') {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (key && !posthog.__loaded) {
    posthog.init(key, {
      api_host: '/ingest',
      ui_host: 'https://us.posthog.com',
      capture_pageview: false, // captured manually (App Router)
      autocapture: true,
      respect_dnt: true,
      persistence: 'localStorage+cookie',
      person_profiles: 'always',
      session_recording: { maskAllInputs: true, maskTextSelector: '[data-ph-mask]' },
    });
  }
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      <PostHogIdentify />
      {children}
    </PHProvider>
  );
}
