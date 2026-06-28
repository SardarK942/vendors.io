'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryStates, parseAsString } from 'nuqs';

export type SearchSegment = 'when' | 'category' | 'what' | null;

export interface SearchState {
  date: string; // ISO YYYY-MM-DD, empty string = unset
  category: string; // slug, '' or 'all' = unset
  query: string; // free text
}

export interface UseSearchStateOptions {
  /** Pre-fill the state from these values on mount. Used by the sticky-header variant on /vendors. */
  initial?: Partial<SearchState>;
}

export interface UseSearchStateReturn {
  state: SearchState;
  setDate: (d: string) => void;
  setCategory: (c: string) => void;
  setQuery: (q: string) => void;
  activeSegment: SearchSegment;
  setActiveSegment: (s: SearchSegment) => void;
  /**
   * Submit to /vendors. Optional `overrides` merge over current state at submit
   * time — necessary when a handler does setX(value) + submit() on the same tick
   * (the React state update is async; the override carries the fresh value).
   */
  submit: (overrides?: Partial<SearchState>) => void;
}

/**
 * Hook for the SearchBar's URL-synced state + URL-param submission.
 *
 * In-progress edits sync to the current URL via nuqs (`date`, `category`, `q`),
 * so deep links + shareable URLs + browser back/forward all work. Submission
 * navigates to /vendors with the same params; the page reads them server-side
 * via searchParams in page.tsx props.
 */
export function useSearchState(options: UseSearchStateOptions = {}): UseSearchStateReturn {
  const router = useRouter();
  const [params, setParams] = useQueryStates(
    {
      date: parseAsString.withDefault(''),
      category: parseAsString.withDefault(''),
      q: parseAsString.withDefault(''),
    },
    { clearOnDefault: true, throttleMs: 200 }
  );

  // Allow caller-provided `initial` to override URL on first render (used by the
  // sticky-header variant on /vendors when it wants to honor server props rather
  // than current URL — a rare path).
  const state: SearchState = {
    date: options.initial?.date ?? params.date,
    category: options.initial?.category ?? params.category,
    query: options.initial?.query ?? params.q,
  };

  const [activeSegment, setActiveSegment] = useState<SearchSegment>(null);

  const setDate = useCallback((d: string) => void setParams({ date: d }), [setParams]);
  const setCategory = useCallback((c: string) => void setParams({ category: c }), [setParams]);
  const setQuery = useCallback((q: string) => void setParams({ q }), [setParams]);

  const submit = useCallback(
    (overrides?: Partial<SearchState>) => {
      const final: SearchState = { ...state, ...(overrides ?? {}) };
      const search = new URLSearchParams();
      if (final.date) search.set('date', final.date);
      if (final.category && final.category !== 'all') search.set('category', final.category);
      if (final.query.trim()) search.set('q', final.query.trim());
      const qs = search.toString();
      router.push(`/vendors${qs ? `?${qs}` : ''}`);
      setActiveSegment(null);
    },
    [router, state]
  );

  return {
    state,
    setDate,
    setCategory,
    setQuery,
    activeSegment,
    setActiveSegment,
    submit,
  };
}
