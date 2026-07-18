// Customer Events service — event graph CRUD + booking↔slot linking.
// Mirrors the ServiceResult convention in booking.service.ts.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, EventRow } from '@/types/database.types';
import type { CreateEventInput } from '@/types';
import type { NeedWithBooking } from '@/lib/events/derive';

type Sb = SupabaseClient<Database>;
type Result<T> = { data?: T; error?: string; status: number };

export async function createEventWithGraph(
  supabase: Sb,
  coupleUserId: string,
  input: CreateEventInput
): Promise<Result<{ eventId: string }>> {
  const { data: event, error: eventError } = await supabase
    .from('events')
    .insert({
      couple_user_id: coupleUserId,
      name: input.name,
      celebration_type: input.celebration_type,
      city: input.city ?? null,
      total_budget_cents: input.total_budget_cents ?? null,
    })
    .select('id')
    .single();
  if (eventError || !event)
    return { error: eventError?.message ?? 'Failed to create event', status: 500 };

  // Rollback helper: cascades wipe the whole graph.
  const rollback = async (msg: string): Promise<Result<{ eventId: string }>> => {
    await supabase.from('events').delete().eq('id', event.id);
    return { error: msg, status: 500 };
  };

  const { data: fns, error: fnError } = await supabase
    .from('event_functions')
    .insert(
      input.functions.map((f, i) => ({
        event_id: event.id,
        sequence: i + 1,
        label: f.label,
        event_type_id: f.event_type_id ?? null,
        date: f.date ?? null,
        guest_estimate: f.guest_estimate ?? null,
      }))
    )
    .select('id, sequence');
  if (fnError || !fns) return rollback(fnError?.message ?? 'Failed to create functions');

  const fnIdByIndex = new Map(fns.map((f) => [f.sequence - 1, f.id]));

  const needRows = input.functions.flatMap((f, i) =>
    f.vendor_needs.map((n, j) => ({
      event_function_id: fnIdByIndex.get(i)!,
      category: n.category,
      manual_vendor_name: n.manual_booked ? (n.manual_vendor_name ?? null) : null,
      manual_amount_cents: n.manual_booked ? (n.manual_amount_cents ?? null) : null,
      manual_booked: n.manual_booked,
      sort: j,
    }))
  );
  if (needRows.length > 0) {
    const { error } = await supabase.from('event_vendor_needs').insert(needRows);
    if (error) return rollback(error.message);
  }

  if (input.allocations.length > 0) {
    const { error } = await supabase.from('event_budget_allocations').insert(
      input.allocations.map((a) => ({
        event_id: event.id,
        category: a.category,
        planned_cents: a.planned_cents,
      }))
    );
    if (error) return rollback(error.message);
  }

  if (input.tasks.length > 0) {
    const { error } = await supabase.from('event_tasks').insert(
      input.tasks.map((t, i) => ({
        event_id: event.id,
        event_function_id:
          t.function_index != null ? (fnIdByIndex.get(t.function_index) ?? null) : null,
        title: t.title,
        due_date: t.due_date ?? null,
        sort: i,
      }))
    );
    if (error) return rollback(error.message);
  }

  return { data: { eventId: event.id }, status: 201 };
}

export async function listEvents(supabase: Sb, coupleUserId: string): Promise<EventRow[]> {
  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('couple_user_id', coupleUserId)
    .order('created_at', { ascending: false });
  return (data ?? []) as EventRow[];
}

export interface EventGraph {
  event: EventRow;
  functions: Database['public']['Tables']['event_functions']['Row'][];
  needs: NeedWithBooking[];
  allocations: Database['public']['Tables']['event_budget_allocations']['Row'][];
  tasks: Database['public']['Tables']['event_tasks']['Row'][];
}

export async function getEventGraph(
  supabase: Sb,
  coupleUserId: string,
  eventId: string
): Promise<EventGraph | null> {
  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .eq('couple_user_id', coupleUserId)
    .single();
  if (!event) return null;

  const { data: functions } = await supabase
    .from('event_functions')
    .select('*')
    .eq('event_id', eventId)
    .order('sequence');
  const fnIds = (functions ?? []).map((f) => f.id);

  let needs: NeedWithBooking[] = [];
  if (fnIds.length > 0) {
    const { data } = await supabase
      .from('event_vendor_needs')
      .select('*, bookings(id, status, total_price_cents, vendor_profiles(business_name))')
      .in('event_function_id', fnIds)
      .order('sort');
    needs = (data ?? []).map((row) => {
      const { bookings: b, ...need } = row as typeof row & {
        bookings: {
          id: string;
          status: string;
          total_price_cents: number | null;
          vendor_profiles: { business_name: string } | null;
        } | null;
      };
      return {
        ...need,
        booking: b
          ? {
              id: b.id,
              status: b.status,
              total_price_cents: b.total_price_cents,
              vendor_business_name: b.vendor_profiles?.business_name ?? null,
            }
          : null,
      } as NeedWithBooking;
    });
  }

  const [{ data: allocations }, { data: tasks }] = await Promise.all([
    supabase.from('event_budget_allocations').select('*').eq('event_id', eventId),
    supabase.from('event_tasks').select('*').eq('event_id', eventId).order('sort'),
  ]);

  return {
    event: event as EventRow,
    functions: functions ?? [],
    needs,
    allocations: allocations ?? [],
    tasks: tasks ?? [],
  };
}
