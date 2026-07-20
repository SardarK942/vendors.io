import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getEventGraph } from '@/services/events.service';
import {
  computeRollups,
  deriveNeedStatus,
  daysUntil,
  DEAD_BOOKING_STATUSES,
} from '@/lib/events/derive';
import { JournalHero } from '@/components/events/JournalHero';
import { FunctionTimeline } from '@/components/events/FunctionTimeline';
import { VendorBoard, type UnlinkedBooking } from '@/components/events/VendorBoard';
import { BudgetPanel } from '@/components/events/BudgetPanel';
import { TasksPanel } from '@/components/events/TasksPanel';

interface EventJournalPageProps {
  params: Promise<{ id: string }>;
}

export default async function EventJournalPage({ params }: EventJournalPageProps) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const graph = await getEventGraph(supabase, user.id, id);
  if (!graph) notFound();

  const rollups = computeRollups(graph.needs);
  const todayIso = new Date().toISOString().slice(0, 10);
  const upcoming = graph.functions
    .filter((f) => f.date && daysUntil(f.date, todayIso) >= 0)
    .sort((a, b) => (a.date! < b.date! ? -1 : 1));
  const daysToGo = upcoming[0]?.date ? daysUntil(upcoming[0].date, todayIso) : null;
  const hasDatedFunction = graph.functions.some((f) => f.date);

  const needsWithStatus = graph.needs.map((n) => ({ ...n, status: deriveNeedStatus(n) }));

  // Couple's own bookings not yet tied to a function on this (or any) event —
  // candidates for the "Link a Baazar booking" picker in VendorBoard.
  const { data: unlinkedBookingsRaw } = await supabase
    .from('bookings')
    .select('id, status, vendor_profiles(business_name, category)')
    .eq('couple_user_id', user.id)
    .is('event_function_id', null)
    .not('status', 'in', `(${DEAD_BOOKING_STATUSES.join(',')})`);

  const unlinkedBookings: UnlinkedBooking[] = (unlinkedBookingsRaw ?? []).map((b) => {
    const vendor = b.vendor_profiles as { business_name: string; category: string } | null;
    return {
      id: b.id,
      status: b.status,
      vendor_business_name: vendor?.business_name ?? 'Unknown vendor',
      category: vendor?.category ?? 'other',
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <JournalHero
        event={graph.event}
        functions={graph.functions}
        daysToGo={daysToGo}
        hasDatedFunction={hasDatedFunction}
        committedCents={rollups.totalCommittedCents}
      />
      <FunctionTimeline
        functions={graph.functions}
        bookedCounts={rollups.bookedCountByFunction}
        todayIso={todayIso}
      />
      <div className="grid items-start gap-4 lg:grid-cols-[1.9fr_1fr]">
        <VendorBoard
          eventId={graph.event.id}
          functions={graph.functions}
          needs={needsWithStatus}
          eventCity={graph.event.city}
          unlinkedBookings={unlinkedBookings}
        />
        <div className="flex flex-col gap-4">
          <BudgetPanel
            event={graph.event}
            rollups={rollups}
            allocations={graph.allocations}
            functions={graph.functions}
          />
          <TasksPanel
            eventId={graph.event.id}
            tasks={graph.tasks}
            functions={graph.functions}
            todayIso={todayIso}
          />
        </div>
      </div>
    </div>
  );
}
