import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { PageTitle } from '@/components/dashboard/PageTitle';
import { daysUntil } from '@/lib/events/derive';
import { dateRangeLabel } from '@/lib/events/format';

export const dynamic = 'force-dynamic';

interface EventListFunction {
  id: string;
  label: string;
  date: string | null;
  sequence: number;
}

interface EventListRow {
  id: string;
  name: string;
  city: string | null;
  functions: EventListFunction[];
}

export default async function EventsListPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Same join shape as getEventOptions (src/lib/events/get-event-options.ts) —
  // events + event_functions(label, date, sequence) in one round trip.
  const { data: rawEvents } = await supabase
    .from('events')
    .select('id, name, city, event_functions(id, label, date, sequence)')
    .eq('couple_user_id', user.id)
    .order('created_at', { ascending: false });

  const events: EventListRow[] = (rawEvents ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    city: e.city,
    functions: [...((e.event_functions as EventListFunction[]) ?? [])].sort(
      (a, b) => a.sequence - b.sequence
    ),
  }));

  const todayIso = new Date().toISOString().slice(0, 10);

  if (events.length === 0) {
    return (
      <div className="space-y-6">
        <PageTitle>My Event</PageTitle>
        <div className="rounded-2xl border border-hairline bg-cream-soft/40 px-8 py-14 text-center">
          <p className="font-display text-2xl text-ink">Plan your celebration</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
            Start a journal to track functions, vendors, budget, and tasks — all in one place.
          </p>
          <Button asChild variant="primary" className="mt-5">
            <Link href="/dashboard/events/new">Start planning →</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageTitle>My Event</PageTitle>

      <div className="grid gap-4 sm:grid-cols-2">
        {events.map((e) => {
          const dateRange = dateRangeLabel(e.functions);
          const metaLine = [dateRange, e.city].filter(Boolean).join(' · ');
          const upcoming = e.functions
            .filter((f): f is EventListFunction & { date: string } => Boolean(f.date))
            .filter((f) => daysUntil(f.date, todayIso) >= 0)
            .sort((a, b) => (a.date < b.date ? -1 : 1));
          const daysToGo = upcoming[0] ? daysUntil(upcoming[0].date, todayIso) : null;
          const hasDatedFunction = e.functions.some((f) => f.date);

          return (
            <div key={e.id} className="rounded-2xl border border-hairline bg-cream p-6">
              <p className="font-display text-xl text-ink">{e.name}</p>
              {metaLine && <p className="mt-1 text-sm text-ink-soft">{metaLine}</p>}

              <div className="mt-4">
                {daysToGo != null ? (
                  <p className="text-sm text-ink-soft">
                    <span className="font-display text-2xl text-ink">{daysToGo}</span>{' '}
                    {daysToGo === 1 ? 'day to go' : 'days to go'}
                  </p>
                ) : hasDatedFunction ? (
                  <p className="text-sm text-ink-soft">Celebration complete</p>
                ) : (
                  <p className="text-sm text-ink-soft">No date set yet</p>
                )}
              </div>

              <Link
                href={`/dashboard/events/${e.id}`}
                className="mt-4 inline-block text-sm font-semibold text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
              >
                Open journal →
              </Link>
            </div>
          );
        })}
      </div>

      <Link
        href="/dashboard/events/new"
        className="inline-block text-sm font-semibold text-indigo hover:underline"
      >
        ＋ Plan another celebration
      </Link>
    </div>
  );
}
