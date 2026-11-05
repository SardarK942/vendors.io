import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PageTitle } from '@/components/dashboard/PageTitle';
import { NotificationsPageClient } from '@/components/notifications/NotificationsPageClient';
import { CaughtUpCard } from '@/components/dashboard/notifications/CaughtUpCard';
import { NotificationSettingsPanel } from '@/components/dashboard/notifications/NotificationSettingsPanel';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Initial fetch — 150 most recent (covers all tabs without immediate "Load more")
  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(150);

  const rows = notifications ?? [];
  // Rail summary reflects server-load state, not live mark-read changes.
  const unreadCount = rows.filter((n) => !n.read_at).length;

  return (
    <div className="space-y-6">
      <PageTitle subtitle="Stay updated with the latest activity and updates from your account.">
        Notifications
      </PageTitle>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <NotificationsPageClient
            userId={user.id}
            initial={rows as Parameters<typeof NotificationsPageClient>[0]['initial']}
          />
        </div>
        <aside className="w-full space-y-4 lg:w-[320px] lg:shrink-0">
          <CaughtUpCard unreadCount={unreadCount} />
          <NotificationSettingsPanel />
        </aside>
      </div>
    </div>
  );
}
