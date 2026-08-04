import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { EventOption } from '@/components/events/EventFunctionSelect';

/** RLS-scoped event+function options for the "Which event is this for?" selector. */
export async function getEventOptions(
  supabase: SupabaseClient<Database>,
  coupleUserId: string
): Promise<EventOption[]> {
  const { data: evts } = await supabase
    .from('events')
    .select('id, name, event_functions(id, label, date, sequence)')
    .eq('couple_user_id', coupleUserId)
    .order('created_at', { ascending: false });

  return (evts ?? []).map((e) => ({
    eventId: e.id,
    eventName: e.name,
    functions: [
      ...((e.event_functions as {
        id: string;
        label: string;
        date: string | null;
        sequence: number;
      }[]) ?? []),
    ]
      .sort((a, b) => a.sequence - b.sequence)
      .map(({ id, label, date }) => ({ id, label, date })),
  }));
}
