import type { SupabaseClient } from '@supabase/supabase-js';

type Role = 'couple' | 'vendor';

export async function getBookingsNeedsActionCount(
  supabase: SupabaseClient,
  role: Role,
  userId: string,
  activeBusinessId: string | null
): Promise<number> {
  if (role === 'vendor') {
    if (!activeBusinessId) return 0;
    const { count, error } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_profile_id', activeBusinessId)
      .eq('status', 'pending_quote');
    if (error) return 0;
    return count ?? 0;
  }

  const { count, error } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('couple_user_id', userId)
    .in('status', ['accepted', 'adjusted_quote_sent']);
  if (error) return 0;
  return count ?? 0;
}

export async function getUnreadNotificationsCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);
  if (error) return 0;
  return count ?? 0;
}
