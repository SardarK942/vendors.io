'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn, VENDOR_CATEGORIES, VENDOR_CATEGORY_LABELS } from '@/lib/utils';
import type { FilterState } from '../use-filter-state';

interface Props {
  state: FilterState;
  patch: (c: Partial<FilterState>) => void;
}

/**
 * Vendor-type picker inside the All-filters drawer. Mirrors the chip-level
 * CategoryDropdown but in a section layout so users who open All filters can
 * also see/change category without closing the sheet.
 */
export function CategorySection({ state, patch }: Props) {
  const selected = state.category;

  return (
    <section className="border-b border-hairline px-7 py-5">
      <h5 className="mb-3 font-display text-[14px] font-bold tracking-[-0.005em] text-ink">
        Vendor type
      </h5>
      <ul role="listbox" aria-label="Vendor category" className="grid grid-cols-2 gap-1">
        <li className="col-span-2">
          <CategoryRow
            label="All categories"
            isSelected={selected === null}
            onClick={() => patch({ category: null })}
          />
        </li>
        {VENDOR_CATEGORIES.map((slug) => (
          <li key={slug}>
            <CategoryRow
              label={VENDOR_CATEGORY_LABELS[slug] ?? slug}
              isSelected={selected === slug}
              onClick={() => patch({ category: selected === slug ? null : slug })}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

interface CategoryRowProps {
  label: string;
  isSelected: boolean;
  onClick: () => void;
}

function CategoryRow({ label, isSelected, onClick }: CategoryRowProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between rounded-sm px-2 py-2 text-left text-[13px] text-ink transition-colors',
        'hover:bg-cream-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo',
        isSelected && 'bg-cream-soft font-medium'
      )}
    >
      <span>{label}</span>
      {isSelected && (
        <Check className="h-3.5 w-3.5 text-ink" strokeWidth={2.5} aria-hidden="true" />
      )}
    </button>
  );
}
