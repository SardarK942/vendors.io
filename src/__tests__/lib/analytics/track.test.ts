import { describe, it, expect, vi, beforeEach } from 'vitest';
import { track } from '@/lib/analytics/track';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';

const capture = vi.fn();
vi.mock('posthog-js', () => ({
  default: {
    get __loaded() {
      return (globalThis as { __phLoaded?: boolean }).__phLoaded ?? false;
    },
    capture: (...args: unknown[]) => capture(...args),
  },
}));

describe('track', () => {
  beforeEach(() => {
    capture.mockClear();
    (globalThis as { __phLoaded?: boolean }).__phLoaded = false;
  });

  it('no-ops when PostHog is not loaded', () => {
    track(ANALYTICS_EVENTS.SIGNUP_STARTED);
    expect(capture).not.toHaveBeenCalled();
  });

  it('captures event + props when loaded', () => {
    (globalThis as { __phLoaded?: boolean }).__phLoaded = true;
    track(ANALYTICS_EVENTS.SIGNUP_SUBMITTED, { role: 'vendor' });
    expect(capture).toHaveBeenCalledWith('signup_submitted', { role: 'vendor' });
  });

  it('never throws if capture blows up', () => {
    (globalThis as { __phLoaded?: boolean }).__phLoaded = true;
    capture.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    expect(() => track(ANALYTICS_EVENTS.ONBOARDING_PUBLISHED)).not.toThrow();
  });

  it('event constants are unique', () => {
    const vals = Object.values(ANALYTICS_EVENTS);
    expect(new Set(vals).size).toBe(vals.length);
  });
});
