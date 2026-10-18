import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import { DashboardShell } from '@/components/dashboard/DashboardShell';
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

  // The vendor onboarding wizard (/dashboard/profile/setup/**) runs in a
  // focused, chrome-less shell. That decision now lives in DashboardShell
  // (client, keyed on usePathname) — NOT here: this layout is a shared segment
  // the App Router preserves across client navigation, so a pathname branch
  // here was sticky and stranded vendors on a sidebar-less dashboard after
  // "Save & exit". We always build the shell data and let the client decide.
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
      <DashboardShell
        defaultSidebarOpen={sidebarOpen}
        panel={panel}
        sidebar={
          <SidebarNav
            role={role}
            hasBusiness={activeProfile != null}
            businessAnchor={<VendorBusinessAnchor business={activeBusiness} />}
            userMenu={<SidebarUserMenu user={{ email, initial }} />}
            bookingsCount={bookingsCount}
            hasUnreadNotifications={unreadCount > 0}
            isBridalWear={activeProfile?.category === 'bridal_wear'}
            isLocalBridalVendor={
              activeProfile?.category === 'bridal_wear' && activeProfile?.vendor_origin === 'local'
            }
          />
        }
      >
        {children}
      </DashboardShell>
    </ActiveBusinessProvider>
  );
}
