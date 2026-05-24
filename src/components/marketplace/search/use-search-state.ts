'use client';

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

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
 * Hook for the SearchBar's local state + URL-param submission.
 *
 * Submission always navigates to /vendors with URL params; the page reads them
 * via useSearchParams() (server-side: searchParams in page.tsx props).
 *
 * Pre-fill from URL is the consumer's responsibility — pass `initial` derived
 * from useSearchParams() in /vendors/page.tsx, or omit on the homepage.
 */
export function useSearchState(options: UseSearchStateOptions = {}): UseSearchStateReturn {
  const router = useRouter();
  // useSearchParams runs every render (App Router is fine with that); we only use the
  // value during initial useState seeding below. State is seeded once, never re-synced
  // from URL, so in-progress edits aren't clobbered by URL changes during typing.
  const searchParams = useSearchParams();

  const initial: SearchState = {
    date: options.initial?.date ?? searchParams.get('date') ?? '',
    category: options.initial?.category ?? searchParams.get('category') ?? '',
    query: options.initial?.query ?? searchParams.get('q') ?? '',
  };

  const [state, setState] = useState<SearchState>(initial);
  const [activeSegment, setActiveSegment] = useState<SearchSegment>(null);

  const setDate = useCallback((d: string) => setState((s) => ({ ...s, date: d })), []);
  const setCategory = useCallback((c: string) => setState((s) => ({ ...s, category: c })), []);
  const setQuery = useCallback((q: string) => setState((s) => ({ ...s, query: q })), []);

  const submit = useCallback(
    (overrides?: Partial<SearchState>) => {
      const final: SearchState = { ...state, ...(overrides ?? {}) };
      const params = new URLSearchParams();
      if (final.date) params.set('date', final.date);
      if (final.category && final.category !== 'all') params.set('category', final.category);
      if (final.query.trim()) params.set('q', final.query.trim());
      const qs = params.toString();
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
