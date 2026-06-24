import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';

import { SidebarNav } from '@/components/dashboard/SidebarNav';
import { getActiveVendorProfileId } from '@/lib/vendor/active';
import { ActiveBusinessProvider } from '@/contexts/ActiveBusinessContext';

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

  // Sub-project I §3.5: expose the active business id to client components
  // inside the dashboard subtree (e.g., booking action handlers in I6).
  const activeBusinessId =
    role === 'vendor' ? await getActiveVendorProfileId(supabase, user.id) : null;

  return (
    <ActiveBusinessProvider activeBusinessId={activeBusinessId}>
      <div className="min-h-screen bg-muted/40">
        <Navbar />
        <div className="mx-auto flex max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:px-8">
          {/* Mobile hamburger */}
          <div className="absolute right-4 top-20 z-10 md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="rounded-md p-2 hover:bg-ink/5"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-64 bg-cream">
                <SidebarNav role={role} />
              </SheetContent>
            </Sheet>
          </div>

          {/* Desktop sidebar */}
          <aside className="hidden w-56 shrink-0 md:block">
            <SidebarNav role={role} />
          </aside>
          <main className="flex-1">{children}</main>
        </div>
        {panel}
      </div>
    </ActiveBusinessProvider>
  );
}
