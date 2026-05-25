'use client';
import * as React from 'react';
import { EVENT_TYPES } from '../constants';
import type { FilterState } from '../use-filter-state';

interface Props {
  state: FilterState;
  patch: (c: Partial<FilterState>) => void;
}

/**
 * UI-only placeholder this PR — `vendor_profiles.event_types` doesn't exist yet.
 * Selecting events updates URL params but the server-side filter is a no-op until
 * a follow-up PR adds the backing column + vendor onboarding question.
 */
export function EventTypesSection({ state, patch }: Props) {
  const toggle = (slug: string) => {
    const next = state.events.includes(slug)
      ? state.events.filter((s) => s !== slug)
      : [...state.events, slug].sort();
    patch({ events: next });
  };
  return (
    <section className="border-b border-hairline px-7 py-5">
      <h5 className="mb-1 font-display text-[14px] font-bold tracking-[-0.005em] text-ink">
        Event types served
      </h5>
      <p className="mb-3 text-[11px] text-ink-soft">
        Coming soon — vendor data backing in a follow-up PR.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {EVENT_TYPES.map((e) => {
          const on = state.events.includes(e.slug);
          return (
            <button
              key={e.slug}
              type="button"
              onClick={() => toggle(e.slug)}
              className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-medium transition-colors ${
                on
                  ? 'border-ink bg-ink text-cream'
                  : 'border-hairline bg-cream text-ink hover:border-ink'
              }`}
            >
              {e.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
