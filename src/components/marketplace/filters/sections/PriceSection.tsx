'use client';
import * as React from 'react';
import { PRICE_BANDS, type PriceBand } from '../constants';
import type { FilterState } from '../use-filter-state';

interface Props {
  state: FilterState;
  patch: (c: Partial<FilterState>) => void;
}

export function PriceSection({ state, patch }: Props) {
  return (
    <section className="border-b border-hairline px-7 py-5">
      <h5 className="mb-1 font-display text-[14px] font-bold tracking-[-0.005em] text-ink">
        Price
      </h5>
      <p className="mb-3 text-[11px] text-ink-soft">Pick a band, or set a custom range below.</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {PRICE_BANDS.map((b) => {
          const on = state.priceBand === b.slug;
          return (
            <button
              key={b.slug}
              type="button"
              onClick={() =>
                patch({
                  priceBand: on ? null : (b.slug as PriceBand),
                  priceMin: null,
                  priceMax: null,
                })
              }
              className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-medium transition-colors ${
                on
                  ? 'border-ink bg-ink text-cream'
                  : 'border-hairline bg-cream text-ink hover:border-ink'
              }`}
            >
              {b.shorthand} {b.label}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2.5">
        <input
          type="number"
          inputMode="numeric"
          placeholder="Min $"
          value={state.priceMin !== null ? Math.round(state.priceMin / 100) : ''}
          onChange={(e) =>
            patch({
              priceBand: null,
              priceMin: e.target.value ? Number(e.target.value) * 100 : null,
            })
          }
          className="flex-1 rounded-sm border border-hairline bg-cream px-2.5 py-2 font-mono text-[13px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
        />
        <input
          type="number"
          inputMode="numeric"
          placeholder="Max $"
          value={state.priceMax !== null ? Math.round(state.priceMax / 100) : ''}
          onChange={(e) =>
            patch({
              priceBand: null,
              priceMax: e.target.value ? Number(e.target.value) * 100 : null,
            })
          }
          className="flex-1 rounded-sm border border-hairline bg-cream px-2.5 py-2 font-mono text-[13px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
        />
      </div>
    </section>
  );
}
