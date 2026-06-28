'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { findCategory } from './search/categories';
import { useSearchState } from './search/use-search-state';
import type { SearchSegment } from './search/use-search-state';
import { SegmentButton } from './search/SegmentButton';
import { WhenPicker } from './search/WhenPicker';
import { CategoryPicker } from './search/CategoryPicker';
import { WhatSuggestions } from './search/WhatSuggestions';
import { MobileSearchSheet } from './search/MobileSearchSheet';

export interface SearchBarProps {
  variant?: 'hero' | 'sticky-header';
  initialDate?: string;
  initialCategory?: string;
  initialQuery?: string;
  className?: string;
}

function formatDateShort(iso: string): string {
  if (!iso) return 'Pick a date';
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Baazar segmented-pill search bar. Composes When / Category / What pickers
 * with an ink submit orb. Renders the desktop pill on >=md viewports and the
 * MobileSearchSheet (Vaul drawer) below md.
 *
 * Submission always navigates to /vendors with URL params.
 */
export function SearchBar({
  variant = 'hero',
  initialDate,
  initialCategory,
  initialQuery,
  className,
}: SearchBarProps) {
  const { state, setDate, setCategory, setQuery, activeSegment, setActiveSegment, submit } =
    useSearchState({
      initial: {
        ...(initialDate !== undefined && { date: initialDate }),
        ...(initialCategory !== undefined && { category: initialCategory }),
        ...(initialQuery !== undefined && { query: initialQuery }),
      },
    });

  const pillRef = React.useRef<HTMLDivElement>(null);
  const whenRef = React.useRef<HTMLButtonElement>(null);
  const categoryRef = React.useRef<HTMLButtonElement>(null);
  // What is an inline input (not a button) so users can type directly into the segment,
  // matching Airbnb's "Where" pattern — single input, suggestions docked below.
  const whatInputRef = React.useRef<HTMLInputElement>(null);

  // Click-outside to close
  React.useEffect(() => {
    if (activeSegment === null) return;
    const onMouseDown = (e: MouseEvent) => {
      if (pillRef.current && !pillRef.current.contains(e.target as Node)) {
        setActiveSegment(null);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [activeSegment, setActiveSegment]);

  // Esc to close
  React.useEffect(() => {
    if (activeSegment === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveSegment(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [activeSegment, setActiveSegment]);

  const toggleSegment = (seg: SearchSegment) =>
    setActiveSegment(activeSegment === seg ? null : seg);

  const handleDatePicked = (iso: string) => {
    setDate(iso);
    setActiveSegment('category');
    categoryRef.current?.focus();
  };

  const handleCategoryPicked = (slug: string) => {
    setCategory(slug);
    setActiveSegment('what');
    whatInputRef.current?.focus();
  };

  const handleQuerySubmit = (q: string) => {
    setQuery(q);
    // Override carries the fresh value — state.query won't have updated yet on this tick
    submit({ query: q });
  };

  const heroSize = variant === 'hero';
  const segmentHeight = heroSize ? 'h-16' : 'h-[52px]';
  const orbSize = heroSize ? 'w-12 h-12' : 'w-11 h-11';
  const category = findCategory(state.category);

  return (
    <>
      {/* Desktop pill (md and up) */}
      <div
        ref={pillRef}
        className={cn('relative mx-auto hidden max-w-[720px] md:block', className)}
        data-testid="search-bar"
      >
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className={cn(
            'inline-flex items-stretch rounded-full border border-hairline bg-cream',
            'w-full',
            heroSize && 'shadow-[0_2px_8px_rgba(27,20,20,0.04)]'
          )}
        >
          <div className={cn('flex flex-1 items-stretch divide-x divide-hairline', segmentHeight)}>
            {/* Each segment wraps itself + its docked panel in a relative container, */}
            {/* so the panel anchors to the triggering segment, not the pill edges. */}
            <div className="relative flex">
              <SegmentButton
                ref={whenRef}
                label="When"
                value={formatDateShort(state.date)}
                isPlaceholder={!state.date}
                isActive={activeSegment === 'when'}
                panelId="search-panel-when"
                onClick={() => toggleSegment('when')}
              />
              {activeSegment === 'when' && (
                <Panel id="search-panel-when">
                  <WhenPicker selected={state.date} onSelect={handleDatePicked} />
                </Panel>
              )}
            </div>
            <div className="relative flex">
              <SegmentButton
                ref={categoryRef}
                label="Category"
                value={category?.label ?? 'All vendors'}
                isPlaceholder={!state.category || state.category === 'all'}
                isActive={activeSegment === 'category'}
                panelId="search-panel-category"
                onClick={() => toggleSegment('category')}
              />
              {activeSegment === 'category' && (
                <Panel id="search-panel-category" widthClass="w-[260px]">
                  <CategoryPicker selected={state.category} onSelect={handleCategoryPicked} />
                </Panel>
              )}
            </div>
            {/* What segment: inline input (not a button) — type directly into the segment. */}
            {/* Panel below shows suggestions only, no second input. */}
            <div
              className={cn(
                'relative flex flex-1 cursor-text flex-col items-start justify-center px-5 text-left lg:px-6',
                'duration-[180ms] ease-[cubic-bezier(.22,1,.36,1)] transition-[background-color,box-shadow]',
                activeSegment !== 'what' && 'hover:bg-cream-soft',
                activeSegment === 'what' &&
                  'relative z-10 rounded-full bg-cream shadow-[inset_0_0_0_2px_hsl(var(--ink)),_0_4px_12px_rgba(27,20,20,0.10)]'
              )}
              onClick={() => whatInputRef.current?.focus()}
            >
              <label
                htmlFor="search-what-input"
                className="mb-1 cursor-text text-[10px] font-bold uppercase leading-none tracking-[0.12em] text-ink"
              >
                What
              </label>
              <input
                ref={whatInputRef}
                id="search-what-input"
                type="search"
                value={state.query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setActiveSegment('what')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submit({ query: state.query });
                  }
                }}
                placeholder='"Bollywood DJ" or "Mehndi artist"…'
                inputMode="search"
                autoComplete="off"
                spellCheck={false}
                aria-controls="search-panel-what"
                aria-expanded={activeSegment === 'what'}
                className={cn(
                  'w-full border-none bg-transparent p-0 font-sans text-[13px] outline-none',
                  'placeholder:italic placeholder:text-ink-soft',
                  state.query ? 'font-medium text-ink' : 'text-ink-muted'
                )}
              />
              {activeSegment === 'what' && (
                <Panel id="search-panel-what" widthClass="w-[340px]">
                  <WhatSuggestions query={state.query} onSubmit={handleQuerySubmit} />
                </Panel>
              )}
            </div>
          </div>

          <button
            type="submit"
            aria-label="Search"
            data-testid="search-orb"
            className={cn(
              'm-1.5 self-center rounded-full bg-ink text-cream',
              'inline-flex flex-shrink-0 items-center justify-center',
              'duration-[220ms] ease-[cubic-bezier(.22,1,.36,1)] transition-[background-color,box-shadow,transform]',
              'hover:-translate-y-[1px] hover:bg-[#2A1E1E] hover:shadow-[0_6px_14px_rgba(27,20,20,0.18)]',
              'motion-reduce:transition-none motion-reduce:hover:transform-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream',
              orbSize
            )}
          >
            <Search className="h-[18px] w-[18px] stroke-cream" strokeWidth={2} aria-hidden="true" />
          </button>
        </form>
      </div>

      {/* Mobile collapsed bar + sheet (below md) */}
      <div className={cn('md:hidden', className)}>
        <MobileSearchSheet
          state={state}
          setDate={setDate}
          setCategory={setCategory}
          setQuery={setQuery}
          submit={submit}
        />
      </div>
    </>
  );
}

interface PanelProps {
  id: string;
  widthClass?: string;
  children: React.ReactNode;
}

/**
 * Docked picker panel. Anchored to its parent segment wrapper via `left-0`;
 * the wrapper must be position:relative. Width defaults to 320px (WhenPicker).
 */
function Panel({ id, widthClass = 'w-[320px]', children }: PanelProps) {
  return (
    <div
      id={id}
      role="dialog"
      aria-modal="false"
      className={cn(
        'absolute left-0 top-[calc(100%+12px)] z-30',
        'rounded-lg border border-hairline bg-cream p-5',
        'shadow-[0_12px_28px_rgba(27,20,20,0.10),_0_4px_8px_rgba(27,20,20,0.06)]',
        'duration-200 animate-in fade-in-0',
        'motion-reduce:animate-none',
        widthClass
      )}
    >
      {children}
    </div>
  );
}
