'use client';

export interface EventOption {
  eventId: string;
  eventName: string;
  functions: { id: string; label: string; date: string | null }[];
}

interface Props {
  options: EventOption[];
  value: string | null;
  onChange: (eventFunctionId: string | null) => void;
}

function fmtDate(d: string | null): string {
  if (!d) return 'date TBD';
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function EventFunctionSelect({ options, value, onChange }: Props) {
  if (options.length === 0) {
    // Book first, plan after: don't send the user into the event wizard mid-
    // booking (it abandons this form). We invite them to plan once the request
    // is placed — see CelebrationPlanNudge on the booking detail page.
    return (
      <p className="text-sm text-ink-soft">
        You can add this booking to a celebration plan after you book.
      </p>
    );
  }
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-semibold text-ink">Which event is this for?</legend>
      <p className="text-xs text-ink-soft">
        Attaching links this booking to your plan, so your budget, checklist, and booked-vendor list
        stay in sync.
      </p>
      {options.length > 1 && (
        <p className="text-xs text-ink-soft">{options.map((o) => o.eventName).join(' · ')}</p>
      )}
      <div role="radiogroup" aria-label="Which event is this for?" className="flex flex-wrap gap-2">
        {options.flatMap((o) =>
          o.functions.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={value === f.id}
              onClick={() => onChange(value === f.id ? null : f.id)}
              className={
                value === f.id
                  ? 'rounded-full border-[1.5px] border-indigo bg-indigo/10 px-4 py-2 text-sm font-semibold text-indigo'
                  : 'rounded-full border-[1.5px] border-hairline bg-cream px-4 py-2 text-sm font-medium text-ink hover:border-indigo/50'
              }
            >
              {options.length > 1 ? `${o.eventName} — ` : ''}
              {f.label} · {fmtDate(f.date)}
            </button>
          ))
        )}
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          onClick={() => onChange(null)}
          className={
            value === null
              ? 'rounded-full border-[1.5px] border-dashed border-ink-muted px-4 py-2 text-sm font-semibold text-ink'
              : 'rounded-full border-[1.5px] border-dashed border-hairline px-4 py-2 text-sm text-ink-soft hover:border-ink-muted'
          }
        >
          Not for an event
        </button>
      </div>
      {value !== null && (
        <p className="rounded-lg bg-indigo/10 px-3 py-2 text-xs leading-relaxed text-indigo">
          This booking will appear in your event journal, and the matching vendor slot will show as
          booked.
        </p>
      )}
    </fieldset>
  );
}
