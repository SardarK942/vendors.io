'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, BookOpen, Heart, Calendar, BarChart3, Bell, User, Package } from 'lucide-react';

export function SidebarNav({ role }: { role: 'couple' | 'vendor' }) {
  const pathname = usePathname();

  // Profile-specific routes peers (Calendar + Packages) sit under
  // /dashboard/profile/* so we need extra care: a startsWith check on
  // /dashboard/profile would light up "Profile" when user is on
  // /dashboard/profile/packages. Profile is active only for the exact path
  // OR the /setup wizard subtree.
  const isActive = (href: string) => {
    if (pathname === href) return true;
    if (href === '/dashboard') return false;
    if (href === '/dashboard/profile') {
      return pathname.startsWith('/dashboard/profile/setup');
    }
    return pathname.startsWith(href);
  };

  const cls = (href: string) =>
    `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-[transform,background-color] active:scale-[0.98] motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream ${
      isActive(href)
        ? 'bg-accent text-accent-foreground shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]'
        : 'hover:bg-accent'
    }`;

  return (
    <nav className="space-y-1">
      <Link href="/dashboard" className={cls('/dashboard')}>
        <Home className="h-4 w-4" aria-hidden="true" /> Home
      </Link>
      <Link href="/dashboard/bookings" className={cls('/dashboard/bookings')}>
        <BookOpen className="h-4 w-4" aria-hidden="true" /> Bookings
      </Link>
      {role === 'couple' && (
        <Link href="/dashboard/saved" className={cls('/dashboard/saved')}>
          <Heart className="h-4 w-4" aria-hidden="true" /> Saved
        </Link>
      )}
      <Link href="/dashboard/notifications" className={cls('/dashboard/notifications')}>
        <Bell className="h-4 w-4" aria-hidden="true" /> Notifications
      </Link>
      {role === 'vendor' && (
        <>
          <Link href="/dashboard/profile/calendar" className={cls('/dashboard/profile/calendar')}>
            <Calendar className="h-4 w-4" aria-hidden="true" /> Calendar
          </Link>
          <Link href="/dashboard/profile/packages" className={cls('/dashboard/profile/packages')}>
            <Package className="h-4 w-4" aria-hidden="true" /> Packages
          </Link>
          <Link href="/dashboard/money" className={cls('/dashboard/money')}>
            <BarChart3 className="h-4 w-4" aria-hidden="true" /> Business Analytics
          </Link>
          <Link href="/dashboard/profile" className={cls('/dashboard/profile')}>
            <User className="h-4 w-4" aria-hidden="true" /> Profile
          </Link>
        </>
      )}
    </nav>
  );
}
