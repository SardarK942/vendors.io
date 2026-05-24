'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Chip } from './Chip';
import { PriceDropdown } from './PriceDropdown';
import { LanguagesDropdown } from './LanguagesDropdown';
import { PRICE_BANDS } from './constants';
import { useFilterState, type FilterDropdown } from './use-filter-state';

export interface FilterChipRowProps {
  /** Optional className override on the row wrapper. */
  className?: string;
  /** Called when user clicks "All filters" chip — parent opens the sheet. */
  onOpenSheet: () => void;
}

/**
 * The horizontal chip row that lives in the sticky band on /vendors, immediately
 * below the search pill. Owns active-dropdown state + dispatches filter changes
 * (via the use-filter-state hook) which trigger URL updates + page re-fetch.
 */
export function FilterChipRow({ className, onOpenSheet }: FilterChipRowProps) {
  const { state, patch, activeDropdown, setActiveDropdown, apply } = useFilterState();
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Click-outside closes active dropdown.
  React.useEffect(() => {
    if (!activeDropdown) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [activeDropdown, setActiveDropdown]);

  // Esc closes active dropdown.
  React.useEffect(() => {
    if (!activeDropdown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveDropdown(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [activeDropdown, setActiveDropdown]);

  const toggleDropdown = (d: FilterDropdown) => setActiveDropdown(activeDropdown === d ? null : d);

  // Commit pending language changes to URL when the Languages dropdown closes.
  // (Languages is multi-select; toggling chips uses patch() during the dropdown
  // session to avoid re-fetching after every click. On close, push to URL.)
  const prevDropdownRef = React.useRef<FilterDropdown>(null);
  React.useEffect(() => {
    if (prevDropdownRef.current === 'languages' && activeDropdown === null) {
      apply();
    }
    prevDropdownRef.current = activeDropdown;
  }, [activeDropdown, apply]);

  const priceBandLabel = state.priceBand
    ? `Price · ${PRICE_BANDS.find((b) => b.slug === state.priceBand)?.shorthand ?? ''}`
    : 'Price';

  return (
    <div
      ref={containerRef}
      className={cn('relative flex items-center gap-2 overflow-x-auto py-1', className)}
      role="toolbar"
      aria-label="Filter vendors"
    >
      {/* Verified */}
      <Chip
        variant="toggle"
        isActive={state.verified}
        onClick={() => apply({ verified: !state.verified })}
      >
        Verified
      </Chip>

      {/* Responds < 24h */}
      <Chip
        variant="toggle"
        isActive={state.respondsIn === 24}
        onClick={() => apply({ respondsIn: state.respondsIn === 24 ? 0 : 24 })}
      >
        Responds &lt; 24h
      </Chip>

      {/* Price */}
      <div className="relative">
        <Chip
          variant="dropdown"
          isActive={activeDropdown === 'price' || !!state.priceBand}
          panelId="filter-panel-price"
          onClick={() => toggleDropdown('price')}
        >
          {priceBandLabel}
        </Chip>
        {activeDropdown === 'price' && (
          <Panel id="filter-panel-price">
            <PriceDropdown
              selected={state.priceBand}
              onSelect={(b) => {
                apply({ priceBand: b });
                setActiveDropdown(null);
              }}
            />
          </Panel>
        )}
      </div>

      {/* Cash-friendly */}
      <Chip
        variant="toggle"
        isActive={state.cashFriendly}
        onClick={() => apply({ cashFriendly: !state.cashFriendly })}
      >
        Cash-friendly
      </Chip>

      {/* Languages */}
      <div className="relative">
        <Chip
          variant="dropdown"
          isActive={activeDropdown === 'languages' || state.languages.length > 0}
          count={state.languages.length}
          panelId="filter-panel-languages"
          onClick={() => toggleDropdown('languages')}
        >
          Languages
        </Chip>
        {activeDropdown === 'languages' && (
          <Panel id="filter-panel-languages">
            <LanguagesDropdown
              selected={state.languages}
              onChange={(next) => patch({ languages: next })}
            />
          </Panel>
        )}
      </div>

      {/* All filters trigger */}
      <Chip variant="all-filters" onClick={onOpenSheet}>
        All filters
      </Chip>
    </div>
  );
}

interface PanelProps {
  id: string;
  children: React.ReactNode;
}

function Panel({ id, children }: PanelProps) {
  return (
    <div
      id={id}
      role="dialog"
      aria-modal="false"
      className={cn(
        'absolute left-0 top-[calc(100%+8px)] z-30',
        'rounded-lg border border-hairline bg-cream p-2',
        'shadow-[0_12px_28px_rgba(27,20,20,0.10),_0_4px_8px_rgba(27,20,20,0.06)]',
        'duration-200 animate-in fade-in-0 motion-reduce:animate-none'
      )}
    >
      {children}
    </div>
  );
}
