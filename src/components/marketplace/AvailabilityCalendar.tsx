'use client';
import { useEffect, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';

interface UnavailableDay {
  date: string;
  fully_blocked: boolean;
  busy_ranges: Array<{ start: string; end: string }>;
}

interface Props {
  vendorSlug: string;
  selectedDate?: Date;
  onSelect: (date: Date | undefined) => void;
}

export function AvailabilityCalendar({ vendorSlug, selectedDate, onSelect }: Props) {
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

  const fullyBlockedDates = unavailable
    .filter((d) => d.fully_blocked)
    .map((d) => new Date(d.date + 'T12:00:00Z'));

  const partialDates = unavailable
    .filter((d) => !d.fully_blocked && d.busy_ranges.length > 0)
    .map((d) => new Date(d.date + 'T12:00:00Z'));

  const selectedKey = selectedDate?.toISOString().slice(0, 10);
  const selectedDayBusy = unavailable.find((d) => d.date === selectedKey)?.busy_ranges ?? [];

  return (
    <div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading availability…</p>
      ) : (
        <>
          <style dangerouslySetInnerHTML={{ __html: `
            .rdp-partial:not([aria-selected]) {
              background-color: rgb(254 249 195);
              color: rgb(120 53 15);
            }
          ` }} />
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={(date) => onSelect(date)}
            disabled={[{ before: new Date() }, ...fullyBlockedDates]}
            modifiers={{ partial: partialDates }}
            modifiersClassNames={{ partial: 'rdp-partial' }}
          />
          {selectedDayBusy.length > 0 && (
            <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-50 p-2 text-xs">
              <strong>Limited availability:</strong>{' '}
              {selectedDayBusy.map((r, i) => (
                <span key={i}>
                  {r.start} – {r.end}
                  {i < selectedDayBusy.length - 1 ? ', ' : ''}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default AvailabilityCalendar;
