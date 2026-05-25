'use client';

import * as React from 'react';
import { DayPicker, type Matcher } from 'react-day-picker';
import 'react-day-picker/style.css';
import { cn } from '@/lib/utils';

export interface DatePickerProps {
  /** ISO YYYY-MM-DD selected date; empty string or undefined for none. */
  selected?: string;
  /** Called with ISO YYYY-MM-DD when user picks a date. */
  onSelect: (iso: string) => void;
  /** Additional disabled matchers merged with the default { before: today }. */
  disabled?: Matcher | Matcher[];
  /** Additional modifiers merged with the built-in 'unavailable'/'partial'. */
  modifiers?: Record<string, Matcher | Matcher[]>;
  /** Per-modifier class overrides. Built-in modifiers have sensible defaults. */
  modifiersClassNames?: Record<string, string>;
  /** Wrapper className. */
  className?: string;
}

const DEFAULT_DISABLED: Matcher = { before: new Date() };

const DEFAULT_MODIFIERS_CLASSNAMES: Record<string, string> = {
  unavailable: 'text-ink-soft line-through opacity-50 cursor-not-allowed',
  partial: 'bg-haldi/15 text-ink hover:bg-haldi/25',
};

/**
 * M+-styled date picker. Wraps react-day-picker v10 in single-select mode.
 * Past dates always disabled (merged with consumer disabled matchers).
 * Returns ISO YYYY-MM-DD in LOCAL timezone to avoid off-by-one.
 *
 * Built-in modifiers (override via modifiersClassNames):
 *  - unavailable: fully blocked dates (ink-soft strikethrough)
 *  - partial: partially booked dates (haldi background tint)
 *
 * Pass the same matcher to both `disabled` and `modifiers.unavailable` when
 * blocked dates should also be unselectable.
 */
export function DatePicker({
  selected,
  onSelect,
  disabled,
  modifiers,
  modifiersClassNames,
  className,
}: DatePickerProps) {
  const selectedDate = selected ? new Date(`${selected}T00:00:00`) : undefined;

  const handleSelect = (date: Date | undefined) => {
    if (!date) return;
    // Local-TZ ISO conversion (do NOT use toISOString — that's UTC and shifts the day).
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    onSelect(`${y}-${m}-${d}`);
  };

  const mergedDisabled: Matcher[] = [
    DEFAULT_DISABLED,
    ...(Array.isArray(disabled) ? disabled : disabled ? [disabled] : []),
  ];

  return (
    <div className={cn('p-1', className)}>
      <DayPicker
        mode="single"
        selected={selectedDate}
        onSelect={handleSelect}
        disabled={mergedDisabled}
        modifiers={modifiers}
        modifiersClassNames={{ ...DEFAULT_MODIFIERS_CLASSNAMES, ...modifiersClassNames }}
        weekStartsOn={0}
        showOutsideDays
        classNames={{
          root: 'text-ink font-sans',
          months: 'flex flex-col',
          month: 'space-y-3',
          month_caption: 'flex items-center justify-between px-1',
          caption_label: 'font-display font-bold text-[15px] tracking-[-0.012em] text-ink',
          nav: 'flex items-center gap-1',
          button_previous:
            'inline-flex items-center justify-center w-7 h-7 rounded-full border border-hairline text-ink-muted hover:border-ink hover:text-ink transition-colors',
          button_next:
            'inline-flex items-center justify-center w-7 h-7 rounded-full border border-hairline text-ink-muted hover:border-ink hover:text-ink transition-colors',
          month_grid: 'w-full border-collapse',
          weekdays: 'flex',
          weekday:
            'w-9 text-center text-[9px] font-semibold uppercase tracking-[0.08em] text-ink-soft py-2',
          week: 'flex',
          day: 'w-9 h-9 text-center text-[12px] p-0',
          day_button:
            'w-9 h-9 inline-flex items-center justify-center rounded-sm text-ink hover:bg-cream-soft transition-colors',
          selected: 'bg-ink !text-cream hover:bg-ink',
          today: '',
          outside: 'text-ink-soft opacity-50',
          disabled: 'text-ink-soft opacity-30 cursor-not-allowed',
        }}
      />
    </div>
  );
}
