import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Admin portal shell. This is the FIRST in-app admin gate — the `admin` role
 * exists in the schema + RLS but nothing else in the app checks it. Logged-out
 * users are bounced to /login (also enforced in middleware); authenticated
 * non-admins are sent back to their dashboard.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/dashboard');

  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="border-b border-ink/10 bg-cream/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="font-semibold tracking-tight">
              Baazar Admin
            </Link>
            <span className="rounded bg-ink/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink/60">
              Internal
            </span>
          </div>
          <nav className="hidden items-center gap-4 text-sm sm:flex">
            <Link href="/admin" className="text-ink/60 hover:text-ink">
              Unfinished
            </Link>
            <Link href="/admin/onboarding" className="text-ink/60 hover:text-ink">
              Onboarding
            </Link>
          </nav>
          <Link href="/dashboard" className="text-sm text-ink/60 hover:text-ink">
            ← Back to dashboard
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
