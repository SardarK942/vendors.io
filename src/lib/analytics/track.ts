import posthog from 'posthog-js';
import type { AnalyticsEvent } from './events';

/**
 * Capture a custom analytics event. No-ops unless posthog-js is initialized
 * (dormant when NEXT_PUBLIC_POSTHOG_KEY is unset) and never throws into callers.
 */
export function track(event: AnalyticsEvent, props?: Record<string, unknown>): void {
  try {
    if (typeof window === 'undefined') return;
    if (!posthog.__loaded) return;
    posthog.capture(event, props);
  } catch {
    // Analytics must never break the app.
  }
}
