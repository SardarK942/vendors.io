'use client';

import * as React from 'react';
import { Clock } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { snapTimeToQuarterHour, to12h, QUARTER_HOUR_SLOTS } from '@/lib/time';

export interface TimeInputProps {
  /** Current value as an `HH:mm` 24h string. */
  value: string;
  /** Emits an `HH:mm` 24h string on a 15-minute grid. */
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}

/**
 * Branded 15-minute time-of-day picker built on Radix Popover.
 *
 * Chrome ignores `step` on a native `<input type="time">` dropdown wheel, so we
 * render a custom listbox of the 96 quarter-hour slots instead. The public
 * props are unchanged from the old native input: emits `HH:mm` 24h; callers
 * own labelling (the label's `htmlFor` points at the trigger `id`).
 */
export function TimeInput({ value, onChange, id, className, disabled, required }: TimeInputProps) {
  const [open, setOpen] = React.useState(false);
  const listboxId = React.useId();

  // Snap the incoming value for display safety; on-grid values are unchanged.
  const snapped = snapTimeToQuarterHour(value);
  const label = to12h(snapped);

  // Index of the currently-selected slot (or -1 when none/off-grid).
  const selectedIndex = QUARTER_HOUR_SLOTS.findIndex((s) => s.value === snapped);
  // On open, focus/scroll target: the selected slot, else 09:00 (index 36).
  const initialIndex = selectedIndex >= 0 ? selectedIndex : 36;

  const [focusedIndex, setFocusedIndex] = React.useState(initialIndex);
  const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  // When the panel opens, reset the focused slot and scroll it into view.
  React.useEffect(() => {
    if (!open) return;
    setFocusedIndex(initialIndex);
    // Wait a frame so the option buttons are mounted before scrolling.
    const raf = requestAnimationFrame(() => {
      optionRefs.current[initialIndex]?.scrollIntoView({ block: 'center' });
    });
    return () => cancelAnimationFrame(raf);
    // Only re-run when the panel opens; initialIndex is derived from value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const commit = (slotValue: string) => {
    onChange(slotValue);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((i) => {
        const next = Math.min(i + 1, QUARTER_HOUR_SLOTS.length - 1);
        optionRefs.current[next]?.focus();
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((i) => {
        const prev = Math.max(i - 1, 0);
        optionRefs.current[prev]?.focus();
        return prev;
      });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-required={required}
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          className={cn(
            'flex w-full items-center justify-between rounded-md border border-hairline bg-cream px-3 py-2 text-ink ring-offset-cream focus:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
        >
          {label ? (
            <span className="font-mono">{label}</span>
          ) : (
            <span className="text-ink-soft">Select a time</span>
          )}
          <Clock className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        id={listboxId}
        align="start"
        sideOffset={4}
        role="listbox"
        onKeyDown={handleKeyDown}
        // Nested inside the custom-request Radix Dialog (modal): the dialog sets
        // `pointer-events: none` on body, which the body-portaled popover panel
        // inherits — so re-enable clicks with `pointer-events-auto`, and z-[60]
        // lifts it above the dialog's z-50 transformed content.
        className="pointer-events-auto z-[60] max-h-[280px] w-[var(--radix-popover-trigger-width)] overflow-y-auto rounded-lg border border-hairline bg-cream p-1"
      >
        {QUARTER_HOUR_SLOTS.map((slot, i) => {
          const isSelected = slot.value === snapped;
          return (
            <button
              key={slot.value}
              ref={(el) => {
                optionRefs.current[i] = el;
              }}
              type="button"
              role="option"
              aria-selected={isSelected}
              tabIndex={i === focusedIndex ? 0 : -1}
              onClick={() => commit(slot.value)}
              className={cn(
                'block w-full rounded-sm px-3 py-2.5 text-left font-mono text-sm transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo',
                isSelected ? 'bg-ink text-cream' : 'text-ink hover:bg-cream-soft'
              )}
            >
              {slot.label}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
