# Baazar Search Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `src/components/marketplace/SearchBar.tsx` with the segmented Airbnb-style pill (When / Category / What + ink submit orb) per [`2026-05-23-baazar-search-bar-design.md`](../specs/2026-05-23-baazar-search-bar-design.md). Ship hero + sticky-header desktop variants plus a Vaul-based mobile bottom sheet.

**Architecture:** Decompose into a thin orchestrator (`SearchBar.tsx`) + 7 focused files under `src/components/marketplace/search/`. Pill state (active segment + segment values + URL sync) lives in a `use-search-state` hook. Each segment has its own picker component (WhenPicker, CategoryPicker, WhatPicker) — desktop renders them in docked panels, mobile composes them stacked inside a Vaul drawer. Categories + popular queries are static constants for Day 1. No new test infra (codebase has zero React component tests); validation = TypeScript + lint + Playwright visual screenshots.

**Tech Stack:** Next.js 14 (App Router), React 18, TypeScript, Tailwind 3.4, `react-day-picker` ^10.0.1 (already installed), `vaul` (to install), `lucide-react` ^0.564.0, `next/navigation`. Builds on the locked button + tooltip primitives from PR #16's brand foundation.

**Branch:** `feat/baazar-search-bar` (already created from `main`, spec committed at `7f383f2`).

**Out of scope (deferred):** `/vendors` page actually filtering by `date` and `q` URL params (currently only reads `category`). The search bar will _send_ the params; consuming them server-side for date-availability + AI semantic search is a follow-up PR.

---

## File Structure

| File                                                      | Action                 | Responsibility                                                                                                      |
| --------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `src/components/marketplace/SearchBar.tsx`                | **Rewrite**            | Pill orchestrator. Owns active-segment state. Renders desktop pill OR mobile bar based on viewport. URL submission. |
| `src/components/marketplace/search/categories.ts`         | **Create**             | Static `CATEGORIES` + `POPULAR_QUERIES` constants.                                                                  |
| `src/components/marketplace/search/use-search-state.ts`   | **Create**             | Custom hook for `{ date, category, query, activeSegment }` state + `submit()` + URL pre-fill.                       |
| `src/components/marketplace/search/SegmentButton.tsx`     | **Create**             | Presentational segment trigger (label + value + active styling).                                                    |
| `src/components/marketplace/search/WhenPicker.tsx`        | **Create**             | `react-day-picker` wrapper restyled to M+.                                                                          |
| `src/components/marketplace/search/CategoryPicker.tsx`    | **Create**             | Vertical category list with icons + selection.                                                                      |
| `src/components/marketplace/search/WhatPicker.tsx`        | **Create**             | Free-text input + filtered popular-query suggestions.                                                               |
| `src/components/marketplace/search/MobileSearchSheet.tsx` | **Create**             | Vaul bottom sheet composing the 3 pickers + sticky Search button.                                                   |
| `src/app/(marketplace)/vendors/page.tsx`                  | **Modify**             | Change SearchBar mount to `variant="sticky-header"`.                                                                |
| `package.json` + `package-lock.json`                      | **Auto**               | Adds `vaul` dep.                                                                                                    |
| `DESIGN.md`                                               | **Modify frontmatter** | Adds `search-bar` entry to `components` block.                                                                      |

---

## Task 1: Setup — install Vaul + create constants

**Files:**

- Modify: `package.json`, `package-lock.json` (auto via npm)
- Create: `src/components/marketplace/search/categories.ts`

- [ ] **Step 1: Install Vaul**

```bash
npm install vaul
```

Expected: `added N packages, audited X packages`. Vaul is ~14KB gzipped, no significant transitive deps.

- [ ] **Step 2: Create the constants file**

Write to `src/components/marketplace/search/categories.ts`:

```ts
import type { LucideIcon } from 'lucide-react';
import {
  Grid,
  Camera,
  Video,
  Sparkles,
  Scissors,
  Music,
  ChefHat,
  Building2,
  Flower2,
  Mail,
} from 'lucide-react';

export interface Category {
  slug: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Static category list for the search bar Category picker.
 *
 * NOTE: This duplicates the `vendor_profiles.category` enum on the backend.
 * If the enum drifts, this list drifts. Follow-up: derive both from a single
 * shared constant or generate from a Supabase types file.
 */
export const CATEGORIES: Category[] = [
  { slug: 'all', label: 'All vendors', icon: Grid },
  { slug: 'photography', label: 'Photography', icon: Camera },
  { slug: 'videography', label: 'Videography', icon: Video },
  { slug: 'mehndi-henna', label: 'Mehndi / Henna', icon: Sparkles },
  { slug: 'hair-makeup', label: 'Hair & Makeup', icon: Scissors },
  { slug: 'dj-music', label: 'DJ & Music', icon: Music },
  { slug: 'photo-booth', label: 'Photo Booth', icon: Camera },
  { slug: 'catering', label: 'Catering', icon: ChefHat },
  { slug: 'venue', label: 'Venue', icon: Building2 },
  { slug: 'decor-floral', label: 'Decor & Floral', icon: Flower2 },
  { slug: 'invitations', label: 'Invitations', icon: Mail },
];

/**
 * Static popular queries used by the What picker's typeahead.
 * Day 1 is hardcoded; a follow-up will swap to a `/api/search/suggest` endpoint.
 */
export const POPULAR_QUERIES: string[] = [
  'South Asian wedding photographer',
  'Bollywood DJ in Chicago',
  'Mehndi artist near downtown',
  'Hindu wedding venue with mandap',
  'Halal catering for 200 guests',
];

/** Get a category by slug. Returns `undefined` if not found. */
export function findCategory(slug: string | undefined): Category | undefined {
  if (!slug) return undefined;
  return CATEGORIES.find((c) => c.slug === slug);
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: only the pre-existing `.next/types/.../setup/layout.ts` error. No errors from `categories.ts`.

- [ ] **Step 4: Verify lint**

Run: `npm run lint`
Expected: exit 0, no new warnings.

- [ ] **Step 5: Stage but do not commit yet (Vaul install + constants will commit together with Task 2's hook in a single setup commit, see Task 2 Step 4).**

---

## Task 2: `use-search-state.ts` hook

**Files:**

- Create: `src/components/marketplace/search/use-search-state.ts`

- [ ] **Step 1: Write the hook**

Write to `src/components/marketplace/search/use-search-state.ts`:

```ts
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
  submit: () => void;
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
  // useSearchParams is read once on mount to seed; we don't reactively re-sync because
  // the user's in-progress edits should not be clobbered by URL changes during typing.
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

  const submit = useCallback(() => {
    const params = new URLSearchParams();
    if (state.date) params.set('date', state.date);
    if (state.category && state.category !== 'all') params.set('category', state.category);
    if (state.query.trim()) params.set('q', state.query.trim());
    const qs = params.toString();
    router.push(`/vendors${qs ? `?${qs}` : ''}`);
    setActiveSegment(null);
  }, [router, state.date, state.category, state.query]);

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
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: only pre-existing error.

- [ ] **Step 3: Verify lint**

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 4: Commit Tasks 1 + 2 together**

```bash
git add package.json package-lock.json \
  src/components/marketplace/search/categories.ts \
  src/components/marketplace/search/use-search-state.ts && \
git commit -m "feat(search): infra — vaul dep + categories constants + state hook"
```

(Pre-commit hooks will run prettier/eslint over the staged files.)

---

## Task 3: `SegmentButton.tsx`

**Files:**

- Create: `src/components/marketplace/search/SegmentButton.tsx`

- [ ] **Step 1: Write the component**

Write to `src/components/marketplace/search/SegmentButton.tsx`:

```tsx
'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SegmentButtonProps {
  /** Uppercase label rendered at the top (e.g. "When"). */
  label: string;
  /** The current value to display below the label. Renders muted when `isPlaceholder` is true. */
  value: string;
  /** Whether the value shown is a placeholder (empty state) — renders ink-muted + italic for What. */
  isPlaceholder?: boolean;
  /** True when this segment is the active (open-panel) one. */
  isActive?: boolean;
  /** Whether this segment expects a free-text-input-style appearance (wider, italic placeholder). */
  isFreeText?: boolean;
  /** ID of the panel this button controls (for aria-controls). */
  panelId?: string;
  /** Click handler. Should toggle the active state in the parent. */
  onClick?: () => void;
  /** Forwarded for keyboard nav. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
}

/**
 * Presentational segment trigger inside the search pill. Owns no state — parent decides
 * active/value. Renders as a focusable button with label on top and value below.
 */
export const SegmentButton = React.forwardRef<HTMLButtonElement, SegmentButtonProps>(
  ({ label, value, isPlaceholder, isActive, isFreeText, panelId, onClick, onKeyDown }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        onKeyDown={onKeyDown}
        aria-expanded={isActive ?? false}
        aria-controls={panelId}
        className={cn(
          'duration-[180ms] ease-[cubic-bezier(.22,1,.36,1)] flex flex-col items-start justify-center text-left transition-all',
          'h-full px-5 focus-visible:outline-none lg:px-6',
          isFreeText && 'min-w-[220px] flex-1',
          // Non-active: hover bg + visible separator handled by parent
          !isActive && 'hover:bg-cream-soft',
          // Active: ink-inset ring, cream fill, soft lift shadow, fully rounded
          isActive &&
            'relative z-10 rounded-full bg-cream shadow-[inset_0_0_0_2px_var(--ink),_0_4px_12px_rgba(27,20,20,0.10)]'
        )}
      >
        <span className="mb-1 text-[10px] font-bold uppercase leading-none tracking-[0.12em] text-ink">
          {label}
        </span>
        <span
          className={cn(
            'whitespace-nowrap text-[13px] leading-tight',
            isPlaceholder && isFreeText && 'italic text-ink-soft',
            isPlaceholder && !isFreeText && 'text-ink-muted',
            !isPlaceholder && 'font-medium text-ink'
          )}
        >
          {value}
        </span>
      </button>
    );
  }
);
SegmentButton.displayName = 'SegmentButton';
```

The component uses `--ink` CSS variable directly in the shadow string because Tailwind arbitrary shadows don't support theme colors there. The variable is wired up in `globals.css` from the Day-1 brand foundation work.

- [ ] **Step 2: Verify typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/marketplace/search/SegmentButton.tsx && \
git commit -m "feat(search): SegmentButton — pill segment trigger w/ ink-inset active ring"
```

---

## Task 4: `WhenPicker.tsx`

**Files:**

- Create: `src/components/marketplace/search/WhenPicker.tsx`

- [ ] **Step 1: Write the component**

Write to `src/components/marketplace/search/WhenPicker.tsx`:

```tsx
'use client';

import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { cn } from '@/lib/utils';

export interface WhenPickerProps {
  /** Currently selected date as ISO YYYY-MM-DD, or empty string. */
  selected?: string;
  /** Called when user picks a date. Receives ISO YYYY-MM-DD. */
  onSelect: (iso: string) => void;
  /** Optional className for the wrapper. */
  className?: string;
}

/**
 * Date picker for the When segment. Wraps react-day-picker v10 with M+ styling.
 * Past dates disabled. Single date select. Sundays first per US convention.
 */
export function WhenPicker({ selected, onSelect, className }: WhenPickerProps) {
  const selectedDate = selected ? new Date(`${selected}T00:00:00`) : undefined;

  const handleSelect = (date: Date | undefined) => {
    if (!date) return;
    // Build ISO YYYY-MM-DD in local timezone (not UTC) to avoid off-by-one
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    onSelect(`${y}-${m}-${d}`);
  };

  return (
    <div className={cn('p-1', className)}>
      <DayPicker
        mode="single"
        selected={selectedDate}
        onSelect={handleSelect}
        disabled={{ before: new Date() }}
        weekStartsOn={0}
        showOutsideDays
        classNames={{
          // Wrapper
          root: 'text-ink font-sans',
          months: 'flex flex-col',
          month: 'space-y-3',
          caption: 'flex items-center justify-between px-1',
          caption_label: 'font-display font-bold text-[15px] tracking-[-0.012em] text-ink',
          nav: 'flex items-center gap-1',
          nav_button:
            'inline-flex items-center justify-center w-7 h-7 rounded-full border border-hairline text-ink-muted hover:border-ink hover:text-ink transition-colors',
          nav_button_previous: 'absolute left-2',
          nav_button_next: 'absolute right-2',
          table: 'w-full border-collapse',
          head_row: 'flex',
          head_cell:
            'w-9 text-center text-[9px] font-semibold uppercase tracking-[0.08em] text-ink-soft py-2',
          row: 'flex',
          cell: 'w-9 h-9 text-center text-[12px] p-0',
          day: 'w-9 h-9 inline-flex items-center justify-center rounded-sm text-ink hover:bg-cream-soft transition-colors',
          day_selected: 'bg-ink !text-cream hover:bg-ink',
          day_today: 'underline decoration-haldi decoration-1 underline-offset-2',
          day_outside: 'text-ink-soft opacity-50',
          day_disabled: 'text-ink-soft opacity-30 cursor-not-allowed',
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: no new errors. (If react-day-picker's `classNames` keys have changed in v10, you'll get a type error here — open the lib's types and update.)

- [ ] **Step 3: Commit**

```bash
git add src/components/marketplace/search/WhenPicker.tsx && \
git commit -m "feat(search): WhenPicker — react-day-picker w/ M+ styling"
```

---

## Task 5: `CategoryPicker.tsx`

**Files:**

- Create: `src/components/marketplace/search/CategoryPicker.tsx`

- [ ] **Step 1: Write the component**

Write to `src/components/marketplace/search/CategoryPicker.tsx`:

```tsx
'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { CATEGORIES } from './categories';

export interface CategoryPickerProps {
  /** Currently selected category slug. Empty string or 'all' = no filter. */
  selected: string;
  /** Called when user picks a category. Receives the slug. */
  onSelect: (slug: string) => void;
}

/**
 * Vertical list of vendor categories with icons. Single-select.
 * Renders inside a panel docked below the Category segment.
 */
export function CategoryPicker({ selected, onSelect }: CategoryPickerProps) {
  return (
    <ul
      role="listbox"
      aria-label="Vendor category"
      className="max-h-80 space-y-0.5 overflow-y-auto"
    >
      {CATEGORIES.map((cat) => {
        const isSelected = selected === cat.slug || (!selected && cat.slug === 'all');
        const Icon = cat.icon;
        return (
          <li key={cat.slug}>
            <button
              type="button"
              role="option"
              aria-selected={isSelected}
              onClick={() => onSelect(cat.slug)}
              className={cn(
                'flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left',
                'text-[13px] text-ink transition-colors',
                'hover:bg-cream-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream',
                isSelected && 'bg-cream-soft font-medium'
              )}
            >
              <span className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-sm bg-hairline-soft">
                <Icon className="h-3.5 w-3.5 stroke-ink" strokeWidth={2} />
              </span>
              {cat.label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/marketplace/search/CategoryPicker.tsx && \
git commit -m "feat(search): CategoryPicker — vendor category list w/ icons"
```

---

## Task 6: `WhatPicker.tsx`

**Files:**

- Create: `src/components/marketplace/search/WhatPicker.tsx`

- [ ] **Step 1: Write the component**

Write to `src/components/marketplace/search/WhatPicker.tsx`:

```tsx
'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { POPULAR_QUERIES } from './categories';

export interface WhatPickerProps {
  /** Current query value. */
  query: string;
  /** Called as the user types. */
  onChange: (q: string) => void;
  /** Called when a suggestion is clicked or Enter is pressed. */
  onSubmit: (q: string) => void;
}

/**
 * Free-text input + filtered popular-query suggestions.
 * Filter is case-insensitive substring match against POPULAR_QUERIES.
 */
export function WhatPicker({ query, onChange, onSubmit }: WhatPickerProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const suggestions = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return POPULAR_QUERIES;
    return POPULAR_QUERIES.filter((p) => p.toLowerCase().includes(q));
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit(query);
    }
  };

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder='"Bollywood DJ" or "Mehndi artist"'
        aria-label="What are you looking for?"
        className={cn(
          'w-full rounded-sm border border-hairline bg-cream px-3.5 py-2.5',
          'font-sans text-[13px] text-ink',
          'placeholder:italic placeholder:text-ink-soft',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream'
        )}
      />

      {suggestions.length > 0 && (
        <>
          <p className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
            Popular
          </p>
          <ul className="space-y-0.5">
            {suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => onSubmit(s)}
                  className={cn(
                    'w-full rounded-sm px-2.5 py-1.5 text-left text-[12px] text-ink-muted',
                    'transition-colors hover:bg-cream-soft hover:text-ink',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo'
                  )}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/marketplace/search/WhatPicker.tsx && \
git commit -m "feat(search): WhatPicker — free text + popular query typeahead"
```

---

## Task 7: `MobileSearchSheet.tsx`

**Files:**

- Create: `src/components/marketplace/search/MobileSearchSheet.tsx`

- [ ] **Step 1: Write the component**

Write to `src/components/marketplace/search/MobileSearchSheet.tsx`:

```tsx
'use client';

import * as React from 'react';
import { Drawer } from 'vaul';
import { Search, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { findCategory } from './categories';
import { WhenPicker } from './WhenPicker';
import { CategoryPicker } from './CategoryPicker';
import { WhatPicker } from './WhatPicker';
import type { SearchState } from './use-search-state';

export interface MobileSearchSheetProps {
  state: SearchState;
  setDate: (d: string) => void;
  setCategory: (c: string) => void;
  setQuery: (q: string) => void;
  submit: () => void;
}

type MobileSection = 'when' | 'category' | 'what' | null;

function formatDateShort(iso: string): string {
  if (!iso) return 'Pick a date';
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Mobile collapsed bar that opens a Vaul bottom sheet with the 3 stacked pickers
 * + sticky Search button. Tap a section header to expand its picker inline.
 */
export function MobileSearchSheet({
  state,
  setDate,
  setCategory,
  setQuery,
  submit,
}: MobileSearchSheetProps) {
  const [open, setOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState<MobileSection>(null);

  const handleSubmit = () => {
    setOpen(false);
    submit();
  };

  const category = findCategory(state.category);

  return (
    <Drawer.Root open={open} onOpenChange={setOpen} shouldScaleBackground>
      <Drawer.Trigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-3 rounded-full px-5 py-3',
            'border border-hairline bg-cream text-ink-muted',
            'text-[13px] transition-colors hover:bg-cream-soft'
          )}
          aria-label="Open search"
        >
          <Search className="h-4 w-4 stroke-ink" strokeWidth={2} />
          Search Chicago weddings
        </button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-ink/50" />
        <Drawer.Content
          className={cn(
            'fixed bottom-0 left-0 right-0 z-50 rounded-t-lg bg-cream',
            'flex h-[75vh] flex-col'
          )}
        >
          {/* Drag handle */}
          <div className="mx-auto mb-1 mt-3 h-1 w-12 rounded-full bg-hairline" aria-hidden="true" />

          <Drawer.Title className="sr-only">Search vendors</Drawer.Title>

          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {/* When */}
            <MobileSection
              label="When"
              value={formatDateShort(state.date)}
              isPlaceholder={!state.date}
              expanded={expanded === 'when'}
              onToggle={() => setExpanded(expanded === 'when' ? null : 'when')}
            >
              <WhenPicker
                selected={state.date}
                onSelect={(d) => {
                  setDate(d);
                  setExpanded('category');
                }}
              />
            </MobileSection>

            {/* Category */}
            <MobileSection
              label="Category"
              value={category?.label ?? 'All vendors'}
              isPlaceholder={!state.category || state.category === 'all'}
              expanded={expanded === 'category'}
              onToggle={() => setExpanded(expanded === 'category' ? null : 'category')}
            >
              <CategoryPicker
                selected={state.category}
                onSelect={(c) => {
                  setCategory(c);
                  setExpanded('what');
                }}
              />
            </MobileSection>

            {/* What */}
            <MobileSection
              label="What are you looking for?"
              value={state.query || '"Bollywood DJ" or "Mehndi artist"'}
              isPlaceholder={!state.query}
              expanded={expanded === 'what'}
              onToggle={() => setExpanded(expanded === 'what' ? null : 'what')}
            >
              <WhatPicker
                query={state.query}
                onChange={setQuery}
                onSubmit={(q) => {
                  setQuery(q);
                  handleSubmit();
                }}
              />
            </MobileSection>
          </div>

          {/* Sticky footer */}
          <div className="border-t border-hairline bg-cream px-5 py-4">
            <Button variant="primary" size="lg" className="w-full" onClick={handleSubmit}>
              Search
            </Button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

interface MobileSectionProps {
  label: string;
  value: string;
  isPlaceholder: boolean;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function MobileSection({
  label,
  value,
  isPlaceholder,
  expanded,
  onToggle,
  children,
}: MobileSectionProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-hairline">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn(
          'flex w-full items-center justify-between px-4 py-3 text-left',
          'bg-cream transition-colors hover:bg-cream-soft'
        )}
      >
        <div className="flex flex-col items-start">
          <span className="mb-1 text-[10px] font-bold uppercase leading-none tracking-[0.12em] text-ink">
            {label}
          </span>
          <span
            className={cn(
              'text-[13px] leading-tight',
              isPlaceholder ? 'italic text-ink-muted' : 'font-medium text-ink'
            )}
          >
            {value}
          </span>
        </div>
        <ChevronDown
          className={cn('h-4 w-4 stroke-ink-muted transition-transform', expanded && 'rotate-180')}
          strokeWidth={2}
        />
      </button>
      {expanded && (
        <div className="border-t border-hairline bg-cream-soft px-4 py-3">{children}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: no new errors. `vaul` types should resolve from the npm install.

- [ ] **Step 3: Commit**

```bash
git add src/components/marketplace/search/MobileSearchSheet.tsx && \
git commit -m "feat(search): MobileSearchSheet — Vaul drawer w/ stacked pickers"
```

---

## Task 8: Rewrite `SearchBar.tsx` orchestrator + update /vendors mount

**Files:**

- Rewrite: `src/components/marketplace/SearchBar.tsx`
- Modify: `src/app/(marketplace)/vendors/page.tsx` (change SearchBar mount)

- [ ] **Step 1: Rewrite the orchestrator**

Write to `src/components/marketplace/SearchBar.tsx` (overwriting the existing single-input version):

```tsx
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
    submit();
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
```

- [ ] **Step 2: Update `/vendors` page mount to use sticky-header variant**

Edit `src/app/(marketplace)/vendors/page.tsx`. Find the line that renders `<SearchBar />` and replace with:

```tsx
<SearchBar variant="sticky-header" initialCategory={category} />
```

(The exact location depends on the current layout in vendors/page.tsx — typically near the top of the JSX, above the VendorGrid. If the page currently uses a `<SearchBar />` mount, replace that occurrence.)

If the existing `vendors/page.tsx` does NOT currently render a `<SearchBar />`, add one at the top of the page body inside a wrapper:

```tsx
<div className="sticky top-16 z-30 border-b border-hairline bg-cream px-4 py-3 sm:px-6 lg:px-8">
  <SearchBar variant="sticky-header" initialCategory={category} />
</div>
```

(Adjust `top-16` to match the navbar height variable used elsewhere.)

- [ ] **Step 3: Verify typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: no new errors.

- [ ] **Step 4: Verify dev server compiles**

Run: `curl -sI http://localhost:3000/ | head -1`
Expected: `HTTP/1.1 200 OK`. If not, check `tail -30 /tmp/baazar-dev.log` for compile errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/marketplace/SearchBar.tsx src/app/\(marketplace\)/vendors/page.tsx && \
git commit -m "feat(search): SearchBar orchestrator + /vendors sticky-header mount"
```

---

## Task 9: Visual verification (Playwright screenshots)

**Files:**

- Read-only — screenshots saved to `/tmp/baazar-search-*.png`

- [ ] **Step 1: Verify dev server healthy**

Run: `curl -sI http://localhost:3000/ | head -1`
Expected: `HTTP/1.1 200 OK`.

- [ ] **Step 2: Homepage hero — large pill default state**

Run: `node /Users/sardarkhan/IdeaProjects/vendors.io/.shot.mjs http://localhost:3000/ /tmp/baazar-search-hero.png`

Read `/tmp/baazar-search-hero.png` and verify:

- Pill is centered in the hero
- 64px tall segments, rounded-full
- Three segments visible: WHEN / CATEGORY / WHAT with their values
- Ink-fill orb on the right with a search icon
- M+ palette: cream pill on cream bg, hairline border, ink labels, ink-muted values

- [ ] **Step 3: Homepage hero — clicked "When" segment**

This requires interactive clicking. Use a one-off Playwright script:

```bash
node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  // Click the When segment (first segment in the search bar)
  await page.locator('[data-testid=search-bar] button').first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/baazar-search-when-open.png', fullPage: false });
  await browser.close();
})();
" 2>&1
```

Read `/tmp/baazar-search-when-open.png` and verify:

- "When" segment shows active state: ink-inset ring + cream-soft fill + soft lift shadow
- Date picker panel docked ~12px below the pill, left-aligned
- Calendar shows current month, Sundays in leftmost column, past dates visibly disabled
- Today's date has a subtle haldi underline
- No selected date yet (no ink-filled cell)

- [ ] **Step 4: Sticky-header variant on `/vendors`**

Run: `node /Users/sardarkhan/IdeaProjects/vendors.io/.shot.mjs http://localhost:3000/vendors /tmp/baazar-search-vendors.png`

Read `/tmp/baazar-search-vendors.png` and verify:

- Smaller pill (52px tall segments) at top of page
- Same three segments + orb
- Sticky behavior visible (pill stays in viewport even with the grid scrolled below)

- [ ] **Step 5: URL pre-fill test**

Run: `node /Users/sardarkhan/IdeaProjects/vendors.io/.shot.mjs "http://localhost:3000/vendors?date=2026-10-17&category=photography&q=Bollywood+DJ" /tmp/baazar-search-prefilled.png`

Read `/tmp/baazar-search-prefilled.png` and verify:

- When segment shows "Oct 17 2026"
- Category segment shows "Photography"
- What segment shows "Bollywood DJ" (ink color, non-italic)

- [ ] **Step 6: Mobile collapsed bar**

```bash
node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/baazar-search-mobile-collapsed.png', fullPage: false });
  // Tap to open sheet
  await page.getByRole('button', { name: /open search/i }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/baazar-search-mobile-open.png', fullPage: false });
  await browser.close();
})();
" 2>&1
```

Read both screenshots. Verify:

- Collapsed: single "Search Chicago weddings" pill bar, full-width within hero
- Open: Vaul drawer from bottom, drag handle, three sections (When/Category/What), sticky ink "Search" button at bottom

- [ ] **Step 7: Diagnose any visual red flags**

If any screenshot looks wrong, common causes:

- **Pure-white panel** → hardcoded `bg-white` somewhere, should be `bg-cream`
- **Sharp 0-radius segments** → cva or rounded class not applied
- **Inactive segment lifting on hover** → only active segment should have shadow/ring
- **Orb tiny or not square** → orbSize class miscalculated, check `w-12 h-12`
- **Calendar in wrong font** → `font-sans` not inherited; add explicit `font-sans` to root
- **Date showing UTC off-by-one** → check `handleSelect` in WhenPicker — should use local timezone

If any panel doesn't render, inspect the dev tools React tree to verify `activeSegment` state.

---

## Task 10: Update `DESIGN.md` with `search-bar` entry

**Files:**

- Modify: `DESIGN.md` frontmatter `components:` block

- [ ] **Step 1: Insert the new entry**

Edit `DESIGN.md`. Find the `components:` block. Insert this new entry AFTER the existing `tooltip:` entry and BEFORE the closing `---` of frontmatter:

```yaml
search-bar:
  pattern: 'Segmented pill — When / Category / What + ink submit orb'
  interaction: 'Click segment → active state (ink-inset ring + cream-soft fill) + docked panel below. Click outside or Esc to close.'
  pickers: 'When = react-day-picker, Category = vertical list with icons, What = free-text + typeahead popular queries'
  variants: 'hero (64px segments, hero placement) and sticky-header (52px segments, sticky on /vendors)'
  mobile: "Collapses to single 'Search Chicago weddings' bar → Vaul bottom sheet with stacked sections + sticky ink Search button"
  submit: 'Always navigates to /vendors with URL params (?date=, ?category=, ?q=)'
  motion: '200ms panel fade-in, 320ms sheet open. -1px lift on orb hover (lighter than button -3px since orb is smaller)'
  accessibility: 'Full keyboard nav, aria-expanded + aria-controls on segments, role=dialog on panels, prefers-reduced-motion honored'
```

Match the indentation pattern of the existing `tooltip:` entry exactly (2 spaces for the component name, 4 spaces for keys).

- [ ] **Step 2: Verify YAML still parses**

Run: `head -150 DESIGN.md | grep -E '^---$' | wc -l`
Expected: at least 2 (open + close).

- [ ] **Step 3: Commit**

```bash
git add DESIGN.md && \
git commit -m "docs(design): add search-bar component to M+ frontmatter"
```

---

## Task 11: Final verification + push branch + open PR

**Files:**

- No code changes

- [ ] **Step 1: Final typecheck**

Run: `npm run typecheck`
Expected: only the pre-existing `.next/types/.../setup/layout.ts` error.

- [ ] **Step 2: Final lint**

Run: `npm run lint`
Expected: exit 0. Pre-existing `<img>` warning in `EventCard.tsx` OK.

- [ ] **Step 3: Existing test suite**

Run: `npm run test`
Expected: 320 tests pass. (No React component tests are touched by this PR.)

- [ ] **Step 4: Final visual sanity check**

Run: `node /Users/sardarkhan/IdeaProjects/vendors.io/.shot.mjs http://localhost:3000/ /tmp/baazar-search-final.png`

Read `/tmp/baazar-search-final.png`. Confirm:

- Hero pill renders correctly
- "Loud weddings. Quiet chaos." hero brand voice still intact
- No visual regressions on the rest of the page

- [ ] **Step 5: Inspect commit log on the branch**

Run: `git log --oneline main..HEAD`
Expected: ~10 commits, all on the search-bar work, with conventional commit prefixes.

- [ ] **Step 6: Push the branch**

Run: `git push -u origin feat/baazar-search-bar`

Expected: pushes the branch to origin and sets upstream tracking.

- [ ] **Step 7: Open the PR**

Run:

```bash
gh pr create --title "feat(search): Baazar segmented-pill search bar" --body "$(cat <<'EOF'
## Summary

Replaces the existing single-text-input `SearchBar` with the Baazar M+ segmented-pill design per [the spec](docs/superpowers/specs/2026-05-23-baazar-search-bar-design.md).

- **3 segments + submit orb**: When / Category / What + ink orb
- **Click-to-activate** segments with docked picker panels below (ink-inset ring on active)
- **Hero variant** (64px segments) on `/`, **sticky-header variant** (52px) on `/vendors`
- **Mobile**: collapses to a single tappable bar → opens a Vaul bottom sheet with stacked pickers + sticky ink Search button
- **URL contract**: `?date=YYYY-MM-DD&category=<slug>&q=<text>` — pre-fills the pill from URL params on `/vendors`
- **Backwards-compat**: `<SearchBar />` with no props still works (defaults to hero variant)

8 new files under `src/components/marketplace/search/` (one constant file, one hook, six components) + the `SearchBar.tsx` orchestrator rewrite.

## Decomposition

| File | Responsibility |
|---|---|
| `categories.ts` | `CATEGORIES` + `POPULAR_QUERIES` constants |
| `use-search-state.ts` | State + URL submission hook |
| `SegmentButton.tsx` | Presentational segment trigger |
| `WhenPicker.tsx` | react-day-picker wrapper, M+ styled |
| `CategoryPicker.tsx` | Category list with icons |
| `WhatPicker.tsx` | Free-text + typeahead |
| `MobileSearchSheet.tsx` | Vaul drawer + stacked pickers |
| `SearchBar.tsx` (rewrite) | Orchestrator: state, active segment, click-outside, mobile-vs-desktop branch |

## Out of scope (deferred)

- `/vendors` page filtering by `date` and `q` params (currently only `category` is consumed server-side). The pill sends them; server-side wiring is a follow-up PR.
- Date range mode, multi-category select, voice search, server-side typeahead — see spec §1.

## Test plan

- [ ] Open homepage — confirm 64px pill, three segments, ink orb
- [ ] Click each segment — verify ink-inset ring + correct docked panel (calendar / category list / text+suggestions)
- [ ] Pick a date — confirm advances focus to Category segment
- [ ] Pick a category — confirm advances focus to What segment
- [ ] Type a query + Enter — verify navigation to `/vendors?date=...&category=...&q=...`
- [ ] Open `/vendors?date=2026-10-17&category=photography&q=Bollywood+DJ` — confirm sticky pill is pre-filled
- [ ] Mobile (375px viewport) — verify collapsed bar + Vaul sheet
- [ ] Esc + click-outside both close the active panel
- [ ] Keyboard nav: Tab between segments, Enter to open, Esc to close

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: `gh pr create` returns a URL like `https://github.com/SardarK942/vendors.io/pull/NN`.

- [ ] **Step 8: Report the PR URL back**

Done. Report the PR URL and the final commit count on the branch.

---

## Out of scope (deferred to follow-up PRs)

- `/vendors` page reads and filters by `date` (vendor availability) and `q` (AI semantic search) URL params. Currently only `category` is consumed.
- Server-side typeahead suggestions API (Day 1 uses static `POPULAR_QUERIES`).
- Date range selection mode for multi-day venues.
- Multi-category select.
- Map-based "where" filter (Chicago-only at launch).
- Persistent navbar mini-search.
- React component test infra (`@testing-library/react` + jsdom) — when added, unit-test `use-search-state` URL round-trip, alias for backwards-compat behavior, and SegmentButton states.
