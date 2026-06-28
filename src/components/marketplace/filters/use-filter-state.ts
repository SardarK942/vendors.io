'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { PriceBand } from './constants';

export type FilterDropdown = 'category' | 'price' | 'languages' | null;

export interface FilterState {
  /** AI search query (free text). Preserved across filter changes. */
  q: string;
  /** Vendor category slug from VENDOR_CATEGORIES, or null for all. */
  category: string | null;
  verified: boolean;
  /** Hours int (1, 4, 24, 48, 72) — vendor matches if response_sla_hours <= this. 0 = unset. */
  respondsIn: number;
  priceBand: PriceBand | null;
  priceMin: number | null; // cents
  priceMax: number | null; // cents
  languages: string[]; // sorted slugs
  years: number; // years_in_business >= this. 0 = unset.
  events: string[]; // sorted slugs
  subcategories: string[]; // sorted slugs
}

const EMPTY_STATE: FilterState = {
  q: '',
  category: null,
  verified: false,
  respondsIn: 0,
  priceBand: null,
  priceMin: null,
  priceMax: null,
  languages: [],
  years: 0,
  events: [],
  subcategories: [],
};

/**
 * Read FilterState from URLSearchParams. Pure function — exported for use by the
 * count API route as well as the hook.
 */
export function readFilterState(params: URLSearchParams): FilterState {
  const get = (k: string) => params.get(k);
  const parseList = (k: string): string[] => {
    const raw = get(k);
    if (!raw) return [];
    return raw.split(',').filter(Boolean).sort();
  };
  const parseInt0 = (k: string): number => {
    const raw = get(k);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const parseCents = (k: string): number | null => {
    const raw = get(k);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  return {
    q: get('q') ?? '',
    category: get('category'),
    verified: get('verified') === '1',
    respondsIn: parseInt0('respondsIn'),
    priceBand: (get('priceBand') as PriceBand | null) ?? null,
    priceMin: parseCents('priceMin'),
    priceMax: parseCents('priceMax'),
    languages: parseList('lang'),
    years: parseInt0('years'),
    events: parseList('events'),
    subcategories: parseList('subcategories'),
  };
}

/**
 * Serialize FilterState to URLSearchParams (omitting empty values).
 */
export function serializeFilterState(state: FilterState): URLSearchParams {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.category) p.set('category', state.category);
  if (state.verified) p.set('verified', '1');
  if (state.respondsIn > 0) p.set('respondsIn', String(state.respondsIn));
  if (state.priceBand) p.set('priceBand', state.priceBand);
  if (state.priceMin !== null) p.set('priceMin', String(state.priceMin));
  if (state.priceMax !== null) p.set('priceMax', String(state.priceMax));
  if (state.languages.length > 0) p.set('lang', state.languages.join(','));
  if (state.years > 0) p.set('years', String(state.years));
  if (state.events.length > 0) p.set('events', state.events.join(','));
  if (state.subcategories.length > 0) p.set('subcategories', state.subcategories.join(','));
  return p;
}

export interface UseFilterStateReturn {
  state: FilterState;
  patch: (changes: Partial<FilterState>) => void;
  reset: () => void;
  /** Currently open dropdown chip ('price' / 'languages' / null). */
  activeDropdown: FilterDropdown;
  setActiveDropdown: (d: FilterDropdown) => void;
  /** Whether the "All filters" sheet is open. */
  sheetOpen: boolean;
  setSheetOpen: (b: boolean) => void;
  /** Push the current state to the URL. Triggers server-side re-fetch. */
  apply: (overrides?: Partial<FilterState>) => void;
}

/**
 * Filter state + URL serialization hook. Mirrors useSearchState from the search bar
 * (PR #18) but for the filter chip surface.
 */
export function useFilterState(): UseFilterStateReturn {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // urlState is always derived from the live URL — updates automatically whenever
  // router.push() completes and Next.js propagates the new searchParams.
  const urlState = useMemo(
    () => readFilterState(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );

  // localPatch holds in-progress edits (e.g. multi-select language session) that
  // haven't been committed to the URL yet. Cleared on apply() / reset().
  const [localPatch, setLocalPatch] = useState<Partial<FilterState>>({});

  // Merged view: local overrides win over URL-derived values.
  const state: FilterState = useMemo(
    () => ({ ...urlState, ...localPatch }),
    [urlState, localPatch]
  );

  const [activeDropdown, setActiveDropdown] = useState<FilterDropdown>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const patch = useCallback(
    (changes: Partial<FilterState>) => setLocalPatch((p) => ({ ...p, ...changes })),
    []
  );

  const reset = useCallback(() => {
    setLocalPatch({});
    const params = serializeFilterState(EMPTY_STATE);
    const qs = params.toString();
    const target = pathname + (qs ? `?${qs}` : '');
    router.push(target);
  }, [router, pathname]);

  const apply = useCallback(
    (overrides?: Partial<FilterState>) => {
      // Merge: url base → local patch → call-site overrides
      const next: FilterState = { ...urlState, ...localPatch, ...(overrides ?? {}) };
      // Clear local patch — the URL will become the new source of truth.
      setLocalPatch({});
      const params = serializeFilterState(next);
      const qs = params.toString();
      const target = pathname + (qs ? `?${qs}` : '');
      router.push(target);
    },
    [router, pathname, urlState, localPatch]
  );

  return {
    state,
    patch,
    reset,
    activeDropdown,
    setActiveDropdown,
    sheetOpen,
    setSheetOpen,
    apply,
  };
}
