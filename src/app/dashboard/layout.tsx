import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { BaazarChrome } from '@/components/ui/BaazarChrome';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';

import { SidebarNav } from '@/components/dashboard/SidebarNav';
import { VendorBusinessAnchor } from '@/components/dashboard/sidebar/VendorBusinessAnchor';
import { SidebarUserMenu } from '@/components/dashboard/sidebar/SidebarUserMenu';
import { getActiveVendorProfile } from '@/lib/vendor/active';
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

  // The vendor onboarding wizard runs in a focused shell (its own rail + live
  // preview) — drop the global dashboard sidebar and its chrome so the flow
  // gets the full canvas and a single source of navigation. The setup route's
  // own layout provides everything the wizard needs.
  const pathname = headers().get('x-pathname') ?? '';
  if (pathname.startsWith('/dashboard/profile/setup')) {
    // No BaazarChrome (bell + dashboard menu) here — the wizard shell provides
    // its own logo + rail + Save & exit, which is the whole point of a focused
    // flow. The homepage preloader lives elsewhere, so nothing is lost.
    return <div className="min-h-screen bg-cream">{children}</div>;
  }

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  const role = (profile?.role as 'couple' | 'vendor') || 'couple';

  const { profile: activeProfile } =
    role === 'vendor' ? await getActiveVendorProfile(supabase, user.id) : { profile: null };

  const activeBusinessId = activeProfile?.id ?? null;
  const activeBusiness = activeProfile
    ? {
        business_name: activeProfile.business_name,
        verified: activeProfile.verified,
        city: activeProfile.base_city,
      }
    : null;

  const [bookingsCount, unreadCount] = await Promise.all([
    getBookingsNeedsActionCount(supabase, role, user.id, activeBusinessId),
    getUnreadNotificationsCount(supabase, user.id),
  ]);

  const email = user.email ?? '';
  const initial = (email.charAt(0) || '?').toUpperCase();

  const cookieStore = await cookies();
  const sidebarOpen = cookieStore.get('sidebar_state')?.value !== 'false';

  return (
    <ActiveBusinessProvider activeBusinessId={activeBusinessId}>
      <div className="min-h-screen bg-muted/40">
        <BaazarChrome />
        <SidebarProvider defaultOpen={sidebarOpen}>
          <SidebarNav
            role={role}
            hasBusiness={activeProfile != null}
            businessAnchor={<VendorBusinessAnchor business={activeBusiness} />}
            userMenu={<SidebarUserMenu user={{ email, initial }} />}
            bookingsCount={bookingsCount}
            hasUnreadNotifications={unreadCount > 0}
          />
          <SidebarInset>
            <div className="mx-auto flex w-full max-w-7xl gap-4 px-4 pb-8 pt-24 sm:px-6 lg:px-8">
              <SidebarTrigger className="absolute right-4 top-20 z-10" />
              <div className="flex-1">{children}</div>
            </div>
          </SidebarInset>
        </SidebarProvider>
        {panel}
      </div>
    </ActiveBusinessProvider>
  );
}
