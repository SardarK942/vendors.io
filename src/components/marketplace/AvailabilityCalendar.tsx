'use client';

import { useEffect, useState } from 'react';
import { DatePicker } from '@/components/ui/date-picker';

interface UnavailableDay {
  date: string; // ISO YYYY-MM-DD
  fully_blocked: boolean;
  busy_ranges: Array<{ start: string; end: string }>;
}

interface AvailabilityCalendarProps {
  vendorSlug: string;
  selected?: string; // ISO YYYY-MM-DD
  onSelect: (iso: string) => void;
}

export function AvailabilityCalendar({
  vendorSlug,
  selected,
  onSelect,
}: AvailabilityCalendarProps) {
  const [unavailable, setUnavailable] = useState<UnavailableDay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/vendors/${vendorSlug}/availability`)
      .then((r) => r.json())
      .then((d) => {
        setUnavailable(d.unavailable ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [vendorSlug]);

  if (loading) {
    return <p className="text-sm text-ink-muted">Loading availability…</p>;
  }

  // Parse 'YYYY-MM-DD' as local-tz noon (avoids the date crossing a TZ boundary).
  const toLocalDate = (iso: string) => new Date(`${iso}T12:00:00`);

  const fullyBlocked = unavailable.filter((d) => d.fully_blocked).map((d) => toLocalDate(d.date));

  const partial = unavailable
    .filter((d) => !d.fully_blocked && d.busy_ranges.length > 0)
    .map((d) => toLocalDate(d.date));

  const selectedBusy = unavailable.find((d) => d.date === selected)?.busy_ranges ?? [];

  return (
    <div>
      <DatePicker
        selected={selected}
        onSelect={onSelect}
        disabled={fullyBlocked}
        modifiers={{ partial }}
      />
      {selectedBusy.length > 0 && (
        <div className="mt-3 rounded-md border border-haldi/30 bg-haldi/10 p-3 text-xs text-ink-muted">
          <strong className="text-ink">Limited availability:</strong>{' '}
          {selectedBusy.map((r, i) => (
            <span key={i} className="tabular-nums">
              {r.start} – {r.end}
              {i < selectedBusy.length - 1 ? ', ' : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default AvailabilityCalendar;
