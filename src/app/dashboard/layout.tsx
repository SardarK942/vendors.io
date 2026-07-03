import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { BaazarChrome } from '@/components/ui/BaazarChrome';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';

import { SidebarNav } from '@/components/dashboard/SidebarNav';
import { VendorBusinessAnchor } from '@/components/dashboard/sidebar/VendorBusinessAnchor';
import { SidebarUserMenu } from '@/components/dashboard/sidebar/SidebarUserMenu';
import { getActiveVendorProfileId, getActiveVendorProfileFullRow } from '@/lib/vendor/active';
import { ActiveBusinessProvider } from '@/contexts/ActiveBusinessContext';
import {
  getBookingsNeedsActionCount,
  getUnreadNotificationsCount,
} from '@/lib/dashboard/sidebar-counts';

export default async function DashboardLayout({
  children,
  panel,
}: {
  children: React.ReactNode;
  panel: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  const role = (profile?.role as 'couple' | 'vendor') || 'couple';

  const activeBusinessId =
    role === 'vendor' ? await getActiveVendorProfileId(supabase, user.id) : null;

  const activeBusiness =
    role === 'vendor' ? await getActiveVendorProfileFullRow(supabase, user.id) : null;

  const [bookingsCount, unreadCount] = await Promise.all([
    getBookingsNeedsActionCount(supabase, role, user.id, activeBusinessId),
    getUnreadNotificationsCount(supabase, user.id),
  ]);

  const email = user.email ?? '';
  const initial = (email.charAt(0) || '?').toUpperCase();

  return (
    <ActiveBusinessProvider activeBusinessId={activeBusinessId}>
      <div className="min-h-screen bg-muted/40">
        <BaazarChrome />
        <SidebarProvider>
          <SidebarNav
            role={role}
            businessAnchor={<VendorBusinessAnchor business={activeBusiness} />}
            userMenu={<SidebarUserMenu user={{ email, initial }} />}
            bookingsCount={bookingsCount}
            hasUnreadNotifications={unreadCount > 0}
          />
          <SidebarInset>
            <div className="mx-auto flex w-full max-w-7xl gap-4 px-4 pb-8 pt-24 sm:px-6 lg:px-8">
              <SidebarTrigger className="absolute right-4 top-20 z-10 md:hidden" />
              <main className="flex-1">{children}</main>
            </div>
          </SidebarInset>
        </SidebarProvider>
        {panel}
      </div>
    </ActiveBusinessProvider>
  );
}
