'use client';
import { useEffect } from 'react';
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { Suspense } from 'react';
import { PostHogPageView } from './PostHogPageView';
import { PostHogIdentify } from './PostHogIdentify';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || posthog.__loaded) return; // dormant when unconfigured
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
  }, []);

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
