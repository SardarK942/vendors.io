import * as React from 'react';
import { snapTimeToQuarterHour } from '@/lib/time';

export interface TimeInputProps {
  /** Current value as an `HH:mm` 24h string. */
  value: string;
  /** Emits an `HH:mm` string already snapped to the nearest 15 minutes. */
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}

/**
 * Presentational time-of-day picker that snaps to 15-minute intervals.
 *
 * `step={900}` (seconds) gives the browser's native picker 15-min increments,
 * and the onChange snap corrects any off-grid value that is typed or pasted.
 * Emits `HH:mm`. Intentionally has no label — callers own labelling.
 */
export function TimeInput({ value, onChange, id, className, disabled, required }: TimeInputProps) {
  return (
    <input
      type="time"
      step={900}
      value={value}
      onChange={(e) => onChange(snapTimeToQuarterHour(e.target.value))}
      id={id}
      className={className}
      disabled={disabled}
      required={required}
    />
  );
}
