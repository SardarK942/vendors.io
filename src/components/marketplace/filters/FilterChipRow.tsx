'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
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
  const priceChipRef = React.useRef<HTMLButtonElement>(null);
  const languagesChipRef = React.useRef<HTMLButtonElement>(null);

  // Click-outside closes active dropdown.
  // NOTE: AnchoredPanel portals its div to document.body, so it is NOT inside
  // containerRef. We also accept clicks inside any [data-filter-panel] element.
  React.useEffect(() => {
    if (!activeDropdown) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const inContainer = containerRef.current?.contains(target ?? null) ?? false;
      const inPanel = !!target?.closest('[data-filter-panel]');
      if (!inContainer && !inPanel) {
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
  // Fire whenever languages WAS active and is NO LONGER active — regardless of
  // what dropdown opens next (e.g. Languages → Price must not lose the patch).
  const prevDropdownRef = React.useRef<FilterDropdown>(null);
  React.useEffect(() => {
    if (prevDropdownRef.current === 'languages' && activeDropdown !== 'languages') {
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
          ref={priceChipRef}
          variant="dropdown"
          isActive={activeDropdown === 'price' || !!state.priceBand}
          panelId="filter-panel-price"
          onClick={() => toggleDropdown('price')}
        >
          {priceBandLabel}
        </Chip>
        {activeDropdown === 'price' && (
          <AnchoredPanel id="filter-panel-price" anchorRef={priceChipRef}>
            <PriceDropdown
              selected={state.priceBand}
              onSelect={(b) => {
                apply({ priceBand: b });
                setActiveDropdown(null);
              }}
            />
          </AnchoredPanel>
        )}
      </div>

      {/* Languages */}
      <div className="relative">
        <Chip
          ref={languagesChipRef}
          variant="dropdown"
          isActive={activeDropdown === 'languages' || state.languages.length > 0}
          count={state.languages.length}
          panelId="filter-panel-languages"
          onClick={() => toggleDropdown('languages')}
        >
          Languages
        </Chip>
        {activeDropdown === 'languages' && (
          <AnchoredPanel id="filter-panel-languages" anchorRef={languagesChipRef}>
            <LanguagesDropdown
              selected={state.languages}
              onChange={(next) => patch({ languages: next })}
            />
          </AnchoredPanel>
        )}
      </div>

      {/* All filters trigger */}
      <Chip variant="all-filters" onClick={onOpenSheet}>
        All filters
      </Chip>
    </div>
  );
}

interface AnchoredPanelProps {
  id: string;
  /** Ref to the trigger button — used to compute fixed position. */
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  children: React.ReactNode;
}

/**
 * Dropdown panel rendered into document.body via a portal so it escapes any
 * overflow:auto ancestor (e.g. the chip row's overflow-x-auto container).
 * Position is anchored below the trigger button using getBoundingClientRect().
 */
function AnchoredPanel({ id, anchorRef, children }: AnchoredPanelProps) {
  const [coords, setCoords] = React.useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = React.useState(false);

  const updatePos = React.useCallback(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + 8, left: rect.left });
    }
  }, [anchorRef]);

  React.useLayoutEffect(() => {
    setMounted(true);
    updatePos();
  }, [updatePos]);

  // Reposition on scroll (capture phase catches scrollable parents) + resize.
  React.useEffect(() => {
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [updatePos]);

  if (!mounted || !coords) return null;

  return createPortal(
    <div
      id={id}
      role="dialog"
      aria-modal="false"
      data-filter-panel="true"
      style={{ top: coords.top, left: coords.left }}
      className={cn(
        'fixed z-[100]',
        'rounded-lg border border-hairline bg-cream p-2',
        'shadow-[0_12px_28px_rgba(27,20,20,0.10),_0_4px_8px_rgba(27,20,20,0.06)]',
        'duration-200 animate-in fade-in-0 motion-reduce:animate-none'
      )}
    >
      {children}
    </div>,
    document.body
  );
}
