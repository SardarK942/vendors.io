'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AiSearchVariant = 'hero' | 'sticky';

const PLACEHOLDERS = [
  'Try: mehndi artist in Naperville under $800',
  'Try: punjabi DJ for July 4 weekend',
  'Try: south-asian wedding photographer · Chicago',
  'Try: catering for 300 guests · halal',
  'Try: photobooth with 360° spinner',
];

export interface AiSearchInputProps {
  variant?: AiSearchVariant;
  className?: string;
  /** Optional initial query value (for SSR-rendered prefill on /vendors?q=...) */
  defaultValue?: string;
}

/**
 * Single-input AI search. Submits → /vendors?q=&lt;query&gt; (preserving existing
 * URL params except `q`). Server component on /vendors reads `q` and runs
 * hybridSearch (semantic + full-text fallback) directly — no client roundtrip.
 */
export function AiSearchInput({
  variant = 'sticky',
  className,
  defaultValue = '',
}: AiSearchInputProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [value, setValue] = React.useState(defaultValue);
  const [phIndex, setPhIndex] = React.useState(0);

  // Rotate the placeholder every 3.5s when the input is empty + not focused.
  React.useEffect(() => {
    if (value) return;
    const t = window.setInterval(() => {
      setPhIndex((i) => (i + 1) % PLACEHOLDERS.length);
    }, 3500);
    return () => window.clearInterval(t);
  }, [value]);

  const submit = React.useCallback(() => {
    const q = value.trim();
    // Preserve other filter params; replace q.
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (q) params.set('q', q);
    else params.delete('q');
    // Reset pagination on new search.
    params.delete('page');
    const qs = params.toString();
    router.push(`/vendors${qs ? `?${qs}` : ''}`);
  }, [value, router, searchParams]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  const isHero = variant === 'hero';

  return (
    <form
      role="search"
      aria-label="Search vendors"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={cn(
        'group relative flex items-center gap-2 rounded-full border border-ink/15 bg-cream shadow-sm transition-shadow',
        'focus-within:border-ink/30 focus-within:shadow-md',
        isHero ? 'h-14 pl-5 pr-2' : 'h-11 pl-4 pr-1.5',
        className
      )}
    >
      <Search aria-hidden className={cn('shrink-0 text-ink/50', isHero ? 'h-5 w-5' : 'h-4 w-4')} />
      <input
        ref={inputRef}
        type="text"
        name="q"
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={PLACEHOLDERS[phIndex]}
        aria-label="Describe the vendor you're looking for"
        className={cn(
          'min-w-0 flex-1 bg-transparent text-ink placeholder:text-ink-muted/70 focus:outline-none',
          isHero ? 'text-base' : 'text-sm'
        )}
      />
      <button
        type="submit"
        aria-label="Search"
        disabled={!value.trim()}
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full bg-ink text-cream transition-all',
          'hover:bg-hot-pink hover:text-cream disabled:opacity-40 disabled:hover:bg-ink',
          isHero ? 'h-11 w-11' : 'h-8 w-8'
        )}
      >
        <ArrowRight className={isHero ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
      </button>
    </form>
  );
}

export default AiSearchInput;
