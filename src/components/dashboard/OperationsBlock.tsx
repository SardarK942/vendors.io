import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getOperationsBuckets, type OperationsEvent } from '@/services/booking.service';

interface OperationsBlockProps {
  vendorProfileId: string;
}

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function FullRow({ ev }: { ev: OperationsEvent }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="font-medium">
          {fmtDate(ev.event_date)} · {ev.event_start_time?.slice(11, 16)}
        </div>
        <div className="text-sm text-muted-foreground">{ev.couple_full_name}</div>
      </div>
      <div className="mt-1 text-sm text-muted-foreground">
        {ev.address_line_1}
        {ev.city ? `, ${ev.city}` : ''} · {ev.package_label ?? 'Booking'}
      </div>
    </div>
  );
}

function CompactRow({ ev }: { ev: OperationsEvent }) {
  return (
    <div className="flex items-center gap-3 rounded border bg-card px-3 py-2 text-sm">
      <span className="font-medium">{fmtDate(ev.event_date)}</span>
      <span className="text-muted-foreground">·</span>
      <span>{ev.couple_full_name}</span>
      <span className="ml-auto truncate text-muted-foreground">{ev.package_label}</span>
    </div>
  );
}

export async function OperationsBlock({ vendorProfileId }: OperationsBlockProps) {
  const supabase = await createServerSupabaseClient();
  const buckets = await getOperationsBuckets(supabase, vendorProfileId);

  const total =
    buckets.today.length +
    buckets.tomorrow.length +
    buckets.thisWeek.length +
    buckets.later.length;

  if (total === 0) {
    return (
      <section className="rounded-lg border bg-card p-8 text-center">
        <h2 className="text-lg font-semibold">Operations · next 30 days</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No upcoming events. Once you have confirmed bookings, they&rsquo;ll show up here.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Operations · next 30 days</h2>

      {buckets.today.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Today</h3>
          {buckets.today.map((ev) => (
            <FullRow key={ev.id} ev={ev} />
          ))}
        </div>
      )}

      {buckets.tomorrow.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
            Tomorrow
          </h3>
          {buckets.tomorrow.map((ev) => (
            <FullRow key={ev.id} ev={ev} />
          ))}
        </div>
      )}

      {buckets.thisWeek.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
            This week
          </h3>
          {buckets.thisWeek.map((ev) => (
            <CompactRow key={ev.id} ev={ev} />
          ))}
        </div>
      )}

      {buckets.later.length > 0 && (
        <details className="space-y-2">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-indigo-600">
            Later · {buckets.later.length}
          </summary>
          <div className="mt-2 space-y-1">
            {buckets.later.map((ev) => (
              <CompactRow key={ev.id} ev={ev} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
