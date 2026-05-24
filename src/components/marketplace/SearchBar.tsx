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
import { WhatPicker } from './search/WhatPicker';
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
  const whatRef = React.useRef<HTMLButtonElement>(null);

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
    whatRef.current?.focus();
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
            <SegmentButton
              ref={whenRef}
              label="When"
              value={formatDateShort(state.date)}
              isPlaceholder={!state.date}
              isActive={activeSegment === 'when'}
              panelId="search-panel-when"
              onClick={() => toggleSegment('when')}
            />
            <SegmentButton
              ref={categoryRef}
              label="Category"
              value={category?.label ?? 'All vendors'}
              isPlaceholder={!state.category || state.category === 'all'}
              isActive={activeSegment === 'category'}
              panelId="search-panel-category"
              onClick={() => toggleSegment('category')}
            />
            <SegmentButton
              ref={whatRef}
              label="What"
              value={state.query || '"Bollywood DJ" or "Mehndi artist"'}
              isPlaceholder={!state.query}
              isFreeText
              isActive={activeSegment === 'what'}
              panelId="search-panel-what"
              onClick={() => toggleSegment('what')}
            />
          </div>

          <button
            type="submit"
            aria-label="Search"
            data-testid="search-orb"
            className={cn(
              'm-1.5 self-center rounded-full bg-ink text-cream',
              'inline-flex flex-shrink-0 items-center justify-center',
              'duration-[220ms] ease-[cubic-bezier(.22,1,.36,1)] transition-all',
              'hover:-translate-y-[1px] hover:bg-[#2A1E1E] hover:shadow-[0_6px_14px_rgba(27,20,20,0.18)]',
              'motion-reduce:transition-none motion-reduce:hover:transform-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream',
              orbSize
            )}
          >
            <Search className="h-[18px] w-[18px] stroke-cream" strokeWidth={2} />
          </button>
        </form>

        {/* Docked panels */}
        {activeSegment === 'when' && (
          <Panel id="search-panel-when" align="left">
            <WhenPicker selected={state.date} onSelect={handleDatePicked} />
          </Panel>
        )}
        {activeSegment === 'category' && (
          <Panel id="search-panel-category" align="center" widthClass="w-[260px]">
            <CategoryPicker selected={state.category} onSelect={handleCategoryPicked} />
          </Panel>
        )}
        {activeSegment === 'what' && (
          <Panel id="search-panel-what" align="right" widthClass="w-[340px]">
            <WhatPicker query={state.query} onChange={setQuery} onSubmit={handleQuerySubmit} />
          </Panel>
        )}
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
  align: 'left' | 'center' | 'right';
  widthClass?: string;
  children: React.ReactNode;
}

function Panel({ id, align, widthClass = 'w-[320px]', children }: PanelProps) {
  const alignClass =
    align === 'left' ? 'left-0' : align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2';
  return (
    <div
      id={id}
      role="dialog"
      aria-modal="false"
      className={cn(
        'absolute top-[calc(100%+12px)] z-30',
        'rounded-lg border border-hairline bg-cream p-5',
        'shadow-[0_12px_28px_rgba(27,20,20,0.10),_0_4px_8px_rgba(27,20,20,0.06)]',
        'motion-reduce:animate-none',
        widthClass,
        alignClass
      )}
    >
      {children}
    </div>
  );
}
