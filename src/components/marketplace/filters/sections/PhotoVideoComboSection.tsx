'use client';
import type { FilterState } from '../use-filter-state';

interface Props {
  state: FilterState;
  patch: (c: Partial<FilterState>) => void;
}

/**
 * "One vendor for photo + video" — matches vendors whose services include BOTH
 * photography and videography (AND-membership), for couples who want a single
 * studio for all camera needs. Distinct from the per-category filters, which are
 * OR-membership on services.
 */
export function PhotoVideoComboSection({ state, patch }: Props) {
  const on = state.photoVideoCombo;
  return (
    <section className="border-b border-hairline px-7 py-5">
      <h5 className="mb-3 font-display text-[14px] font-bold tracking-[-0.005em] text-ink">
        Photography &amp; video
      </h5>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => patch({ photoVideoCombo: !on })}
        className="flex w-full items-center justify-between rounded-sm py-2 text-[13px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
      >
        <span>One vendor for photo + video</span>
        <span
          className={`relative inline-block h-5 w-9 rounded-full transition-colors ${on ? 'bg-ink' : 'bg-hairline'}`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-cream transition-transform ${on ? 'translate-x-4' : ''}`}
          />
        </span>
      </button>
    </section>
  );
}
