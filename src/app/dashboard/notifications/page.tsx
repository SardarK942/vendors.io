import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { NotificationsPageClient } from '@/components/notifications/NotificationsPageClient';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Initial fetch — 150 most recent (covers all 3 tabs without immediate "Load more")
  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(150);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Notifications</h1>
      <NotificationsPageClient
        userId={user.id}
        initial={(notifications ?? []) as Parameters<typeof NotificationsPageClient>[0]['initial']}
      />
    </div>
  );
}
