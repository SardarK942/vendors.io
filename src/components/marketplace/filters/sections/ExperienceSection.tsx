'use client';
import * as React from 'react';
import { YEARS_OPTIONS } from '../constants';
import type { FilterState } from '../use-filter-state';

interface Props {
  state: FilterState;
  patch: (c: Partial<FilterState>) => void;
}

export function ExperienceSection({ state, patch }: Props) {
  return (
    <section className="border-b border-hairline px-7 py-5">
      <h5 className="mb-3 font-display text-[14px] font-bold tracking-[-0.005em] text-ink">
        Experience
      </h5>
      <div className="flex flex-wrap gap-1.5">
        {YEARS_OPTIONS.map((o) => {
          const on = state.years === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => patch({ years: on ? 0 : o.value })}
              className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-medium transition-colors ${
                on
                  ? 'border-ink bg-ink text-cream'
                  : 'border-hairline bg-cream text-ink hover:border-ink'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
