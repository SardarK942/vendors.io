'use client';
import * as React from 'react';
import type { FilterState } from '../use-filter-state';

interface Props {
  state: FilterState;
  patch: (c: Partial<FilterState>) => void;
}

export function TrustSection({ state, patch }: Props) {
  return (
    <section className="border-b border-hairline px-7 py-5">
      <h5 className="mb-3 font-display text-[14px] font-bold tracking-[-0.005em] text-ink">
        Trust &amp; responsiveness
      </h5>
      <ToggleRow
        label="Verified vendors only"
        on={state.verified}
        onChange={(v) => patch({ verified: v })}
      />
      <ToggleRow
        label="Responds within 24 hours"
        on={state.respondsIn === 24}
        onChange={(v) => patch({ respondsIn: v ? 24 : 0 })}
      />
      <ToggleRow
        label="Cash-friendly payments"
        on={state.cashFriendly}
        onChange={(v) => patch({ cashFriendly: v })}
      />
    </section>
  );
}

interface ToggleRowProps {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}
function ToggleRow({ label, on, onChange }: ToggleRowProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between rounded-sm py-2 text-[13px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
    >
      <span>{label}</span>
      <span
        className={`relative inline-block h-5 w-9 rounded-full transition-colors ${on ? 'bg-ink' : 'bg-hairline'}`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-cream transition-transform ${on ? 'translate-x-4' : ''}`}
        />
      </span>
    </button>
  );
}
