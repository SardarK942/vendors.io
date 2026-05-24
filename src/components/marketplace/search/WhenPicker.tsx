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
          // v10: caption → month_caption
          month_caption: 'flex items-center justify-between px-1',
          caption_label: 'font-display font-bold text-[15px] tracking-[-0.012em] text-ink',
          nav: 'flex items-center gap-1',
          // v10: nav_button → button_previous / button_next (no generic nav_button key)
          button_previous:
            'inline-flex items-center justify-center w-7 h-7 rounded-full border border-hairline text-ink-muted hover:border-ink hover:text-ink transition-colors',
          button_next:
            'inline-flex items-center justify-center w-7 h-7 rounded-full border border-hairline text-ink-muted hover:border-ink hover:text-ink transition-colors',
          // v10: table → month_grid; head_row → weekdays; head_cell → weekday; row → week
          month_grid: 'w-full border-collapse',
          weekdays: 'flex',
          weekday:
            'w-9 text-center text-[9px] font-semibold uppercase tracking-[0.08em] text-ink-soft py-2',
          week: 'flex',
          // v10: cell → day (grid cell); day → day_button (interactive button)
          day: 'w-9 h-9 text-center text-[12px] p-0',
          day_button:
            'w-9 h-9 inline-flex items-center justify-center rounded-sm text-ink hover:bg-cream-soft transition-colors',
          // v10: day_selected → selected; day_today → today; day_outside → outside; day_disabled → disabled
          selected: 'bg-ink !text-cream hover:bg-ink',
          // today: underline handled via globals.css [data-today='true'] button selector
          // (Tailwind underline won't pierce the button's text-decoration reset)
          today: '',
          outside: 'text-ink-soft opacity-50',
          disabled: 'text-ink-soft opacity-30 cursor-not-allowed',
        }}
      />
    </div>
  );
}
