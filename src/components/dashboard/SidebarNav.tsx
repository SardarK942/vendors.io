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
    `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
      isActive(href) ? 'bg-accent text-accent-foreground' : 'hover:bg-accent'
    }`;

  return (
    <nav className="space-y-1">
      <Link href="/dashboard" className={cls('/dashboard')}>
        <Home className="h-4 w-4" /> Home
      </Link>
      <Link href="/dashboard/bookings" className={cls('/dashboard/bookings')}>
        <BookOpen className="h-4 w-4" /> Bookings
      </Link>
      {role === 'couple' && (
        <Link href="/dashboard/saved" className={cls('/dashboard/saved')}>
          <Heart className="h-4 w-4" /> Saved
        </Link>
      )}
      <Link href="/dashboard/notifications" className={cls('/dashboard/notifications')}>
        <Bell className="h-4 w-4" /> Notifications
      </Link>
      {role === 'vendor' && (
        <>
          <Link href="/dashboard/profile/calendar" className={cls('/dashboard/profile/calendar')}>
            <Calendar className="h-4 w-4" /> Calendar
          </Link>
          <Link href="/dashboard/profile/packages" className={cls('/dashboard/profile/packages')}>
            <Package className="h-4 w-4" /> Packages
          </Link>
          <Link href="/dashboard/money" className={cls('/dashboard/money')}>
            <BarChart3 className="h-4 w-4" /> Business Analytics
          </Link>
          <Link href="/dashboard/profile" className={cls('/dashboard/profile')}>
            <User className="h-4 w-4" /> Profile
          </Link>
        </>
      )}
    </nav>
  );
}
