import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();

  const role = profile?.role || 'couple';

  return (
    <div className="min-h-screen bg-muted/40">
      <Navbar />
      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:px-8">
        {/* Sidebar */}
        <aside className="hidden w-56 shrink-0 md:block">
          <nav className="space-y-1">
            <Link
              href="/dashboard"
              className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              Overview
            </Link>
            <Link
              href="/dashboard/bookings"
              className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              Bookings
            </Link>
            {role === 'vendor' && (
              <>
                <Link
                  href="/dashboard/profile"
                  className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
                >
                  My Profile
                </Link>
                <Link
                  href="/dashboard/stripe/success"
                  className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
                >
                  Payments
                </Link>
              </>
            )}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
