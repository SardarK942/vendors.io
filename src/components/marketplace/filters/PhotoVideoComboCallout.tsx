'use client';

import { Camera, Video, ArrowRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFilterState } from './use-filter-state';

/**
 * Contextual invitation to the "one vendor for photo + video" filter, shown
 * above the results grid ONLY while browsing Photography or Videography. It
 * replaces the easy-to-miss row toggle: a couple scanning the grid sees the
 * value proposition ("one team for both") stated in words, with a clear CTA,
 * instead of a cryptic pill lost among Verified / Responds.
 *
 * Two states share the same photoVideoCombo FilterState (and the sheet switch):
 *   off  -> quiet cream-soft band + solid-ink CTA (the one ink pop, discoverable)
 *   on   -> ink-filled band confirming the active filter + a quiet "show all"
 *
 * Renders nothing for every other category, so it never clutters unrelated
 * browsing.
 */
export function PhotoVideoComboCallout() {
  const { state, apply } = useFilterState();
  const relevant = state.category === 'photography' || state.category === 'videography';
  if (!relevant) return null;

  const on = state.photoVideoCombo;

  return (
    <div
      className={cn(
        'mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-lg border px-5 py-4 transition-colors',
        on ? 'border-ink bg-ink text-cream' : 'border-hairline bg-cream-soft text-ink'
      )}
    >
      <div className="flex items-center gap-3.5">
        <span
          className={cn('inline-flex shrink-0 items-center', on ? 'text-cream' : 'text-ink')}
          aria-hidden="true"
        >
          <Camera className="size-5" strokeWidth={1.75} />
          <Video className="-ml-1.5 size-5" strokeWidth={1.75} />
        </span>
        <div>
          <p className="font-display text-[15px] font-semibold leading-tight tracking-[-0.005em]">
            {on ? 'Showing studios that do both photo + video' : 'Prefer one team for both?'}
          </p>
          <p className={cn('text-[13px] leading-snug', on ? 'text-cream/80' : 'text-ink-muted')}>
            {on
              ? 'These studios cover your photography and videography together.'
              : 'Some studios cover your photography and videography together. Book one team.'}
          </p>
        </div>
      </div>

      <button
        type="button"
        aria-pressed={on}
        onClick={() => apply({ photoVideoCombo: !on })}
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2',
          on
            ? 'bg-cream/[0.16] text-cream hover:bg-cream/25 focus-visible:ring-offset-ink'
            : 'bg-ink text-cream hover:bg-ink/90 focus-visible:ring-offset-cream'
        )}
      >
        {on ? (
          <>
            <X className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
            Show all studios
          </>
        ) : (
          <>
            Show photo + video studios
            <ArrowRight className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
          </>
        )}
      </button>
    </div>
  );
}
