'use client';
import * as React from 'react';
import { CULTURAL_EVENT_TYPES, GENERAL_EVENT_TYPES } from '@/types';
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

  const renderChip = (e: { id: string; label: string }) => {
    const on = state.events.includes(e.id);
    return (
      <button
        key={e.id}
        type="button"
        onClick={() => toggle(e.id)}
        className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-medium transition-colors ${
          on ? 'border-ink bg-ink text-cream' : 'border-hairline bg-cream text-ink hover:border-ink'
        }`}
      >
        {e.label}
      </button>
    );
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
        {CULTURAL_EVENT_TYPES.map(renderChip)}
        <span className="inline-flex h-7 items-center px-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
          Other celebrations
        </span>
        {GENERAL_EVENT_TYPES.map(renderChip)}
      </div>
    </section>
  );
}
