'use client';

import { cn, VENDOR_CATEGORIES, VENDOR_CATEGORY_LABELS } from '@/lib/utils';

/** Photo/video/content mesh most — surface them first so dual studios opt in. */
const VISUAL_CLUSTER = ['photography', 'videography', 'content_creation'];

interface Props {
  /** The vendor's primary category — always included, shown locked. */
  primary: string;
  /** Full services list (includes primary). */
  selected: string[];
  onChange: (next: string[]) => void;
  className?: string;
}

/**
 * Multi-select over the category vocabulary for "other services you offer".
 * The primary is rendered as a locked chip (can't be removed); the rest toggle.
 * `selected` / `onChange` carry the FULL services set (primary included), so the
 * invariant "services always contains the primary" holds by construction.
 */
export function ServicesMultiSelect({ primary, selected, onChange, className }: Props) {
  const allCategories = VENDOR_CATEGORIES as readonly string[];
  const rank = (slug: string) => {
    const v = VISUAL_CLUSTER.indexOf(slug);
    return v >= 0 ? v : 100 + allCategories.indexOf(slug);
  };
  const options = allCategories.filter((c) => c !== primary).sort((a, b) => rank(a) - rank(b));

  const toggle = (slug: string) => {
    if (selected.includes(slug)) onChange(selected.filter((s) => s !== slug));
    else onChange([...selected, slug]);
  };

  return (
    <div
      className={cn('flex flex-wrap gap-2', className)}
      role="group"
      aria-label="Services offered"
    >
      <span className="rounded-full border border-ink bg-ink px-3 py-1.5 text-sm text-cream">
        {VENDOR_CATEGORY_LABELS[primary] ?? primary} · Primary
      </span>
      {options.map((slug) => {
        const isOn = selected.includes(slug);
        return (
          <button
            type="button"
            key={slug}
            aria-pressed={isOn}
            onClick={() => toggle(slug)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm transition-colors',
              isOn
                ? 'border-ink bg-ink text-cream'
                : 'border-hairline bg-cream text-ink hover:border-ink'
            )}
          >
            {VENDOR_CATEGORY_LABELS[slug] ?? slug}
          </button>
        );
      })}
    </div>
  );
}
