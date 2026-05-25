'use client';

import { DatePicker } from '@/components/ui/date-picker';

export interface WhenPickerProps {
  /** Currently selected date as ISO YYYY-MM-DD, or empty string. */
  selected?: string;
  /** Called when user picks a date. Receives ISO YYYY-MM-DD. */
  onSelect: (iso: string) => void;
  /** Optional className for the wrapper. */
  className?: string;
}

/**
 * Date picker for the search bar's When segment. Thin wrapper over <DatePicker>
 * — kept as a named alias for the search-bar context (in case we add segment-
 * specific behavior later, like haldi-marked "popular wedding dates").
 */
export function WhenPicker({ selected, onSelect, className }: WhenPickerProps) {
  return <DatePicker selected={selected} onSelect={onSelect} className={className} />;
}
