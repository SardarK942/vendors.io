'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { PRICE_BANDS, type PriceBand } from './constants';

export interface PriceDropdownProps {
  /** Currently selected band, or null for unset. */
  selected: PriceBand | null;
  /** Called when user picks a band. */
  onSelect: (band: PriceBand | null) => void;
}

/**
 * Price-band picker panel that docks below the Price chip in the chip row.
 * Single-select (clicking the active band clears the selection).
 */
export function PriceDropdown({ selected, onSelect }: PriceDropdownProps) {
  return (
    <ul role="listbox" aria-label="Price band" className="min-w-[200px] py-1">
      {PRICE_BANDS.map((band) => {
        const isSelected = selected === band.slug;
        return (
          <li key={band.slug}>
            <button
              type="button"
              role="option"
              aria-selected={isSelected}
              onClick={() => onSelect(isSelected ? null : band.slug)}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2 text-left',
                'text-[13px] text-ink transition-colors',
                'hover:bg-cream-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo',
                isSelected && 'bg-cream-soft font-medium'
              )}
            >
              <span>{band.label}</span>
              <span className="text-[12px] tabular-nums text-ink-muted">{band.shorthand}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
