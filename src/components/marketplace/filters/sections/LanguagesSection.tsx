'use client';
import * as React from 'react';
import { LANGUAGES } from '../constants';
import type { FilterState } from '../use-filter-state';

interface Props {
  state: FilterState;
  patch: (c: Partial<FilterState>) => void;
}

export function LanguagesSection({ state, patch }: Props) {
  const toggle = (slug: string) => {
    const next = state.languages.includes(slug)
      ? state.languages.filter((s) => s !== slug)
      : [...state.languages, slug].sort();
    patch({ languages: next });
  };
  return (
    <section className="border-b border-hairline px-7 py-5">
      <h5 className="mb-1 font-display text-[14px] font-bold tracking-[-0.005em] text-ink">
        Languages spoken
      </h5>
      <p className="mb-3 text-[11px] text-ink-soft">Vendor team can communicate in any of these.</p>
      <div className="flex flex-wrap gap-1.5">
        {LANGUAGES.map((l) => {
          const on = state.languages.includes(l.slug);
          return (
            <button
              key={l.slug}
              type="button"
              onClick={() => toggle(l.slug)}
              className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-medium transition-colors ${
                on
                  ? 'border-ink bg-ink text-cream'
                  : 'border-hairline bg-cream text-ink hover:border-ink'
              }`}
            >
              {l.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
