'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, BookOpen, Calendar, Wallet, Bell, User } from 'lucide-react';

export function SidebarNav({ role }: { role: 'couple' | 'vendor' }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href));

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
      <Link href="/dashboard/notifications" className={cls('/dashboard/notifications')}>
        <Bell className="h-4 w-4" /> Notifications
      </Link>
      {role === 'vendor' && (
        <>
          <Link href="/dashboard/profile/calendar" className={cls('/dashboard/profile/calendar')}>
            <Calendar className="h-4 w-4" /> Calendar
          </Link>
          <Link href="/dashboard/money" className={cls('/dashboard/money')}>
            <Wallet className="h-4 w-4" /> Money
          </Link>
          <Link href="/dashboard/profile" className={cls('/dashboard/profile')}>
            <User className="h-4 w-4" /> Profile
          </Link>
        </>
      )}
    </nav>
  );
}
