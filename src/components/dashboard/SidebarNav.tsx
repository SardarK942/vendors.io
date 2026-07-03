'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Bell,
  BookOpen,
  Calendar,
  Heart,
  Home,
  Package,
  Settings as SettingsIcon,
  User,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

type Role = 'couple' | 'vendor';

interface Props {
  role: Role;
  businessAnchor: React.ReactNode;
  userMenu: React.ReactNode;
  bookingsCount: number;
  hasUnreadNotifications: boolean;
}

interface LinkDef {
  href: string;
  label: string;
  icon: React.ElementType;
  showBookingsCounter?: boolean;
  showUnreadDot?: boolean;
}

function workspaceLinks(role: Role): LinkDef[] {
  const links: LinkDef[] = [
    { href: '/dashboard', label: 'Home', icon: Home },
    { href: '/dashboard/bookings', label: 'Bookings', icon: BookOpen, showBookingsCounter: true },
  ];
  if (role === 'couple') {
    links.push({ href: '/dashboard/saved', label: 'Saved', icon: Heart });
  }
  links.push({
    href: '/dashboard/notifications',
    label: 'Notifications',
    icon: Bell,
    showUnreadDot: true,
  });
  if (role === 'vendor') {
    links.push(
      { href: '/dashboard/profile/calendar', label: 'Calendar', icon: Calendar },
      { href: '/dashboard/profile/packages', label: 'Packages', icon: Package },
      { href: '/dashboard/money', label: 'Business Analytics', icon: BarChart3 },
      { href: '/dashboard/profile', label: 'Profile', icon: User }
    );
  }
  return links;
}

export function SidebarNav({
  role,
  businessAnchor,
  userMenu,
  bookingsCount,
  hasUnreadNotifications,
}: Props) {
  const pathname = usePathname();

  // Preserves prior isActive semantics.
  const isActive = (href: string) => {
    if (pathname === href) return true;
    if (href === '/dashboard') return false;
    if (href === '/dashboard/profile') {
      return pathname.startsWith('/dashboard/profile/setup');
    }
    return pathname.startsWith(href);
  };

  return (
    <Sidebar collapsible="icon">
      {role === 'vendor' && businessAnchor ? (
        <SidebarHeader className="border-b border-hairline-soft">{businessAnchor}</SidebarHeader>
      ) : null}

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="font-mono text-[10px] font-bold uppercase tracking-widest text-indigo">
            Workspace
          </SidebarGroupLabel>
          <SidebarMenu>
            {workspaceLinks(role).map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <SidebarMenuItem key={link.href}>
                  <SidebarMenuButton asChild isActive={active} tooltip={link.label}>
                    <Link href={link.href}>
                      <Icon className="size-4" aria-hidden />
                      <span>{link.label}</span>
                      {link.showUnreadDot && hasUnreadNotifications ? (
                        <span
                          aria-label="Unread notifications"
                          className="ml-auto size-2 rounded-full bg-hot-pink shadow-[0_0_0_3px_rgba(209,0,108,0.18)]"
                        />
                      ) : null}
                    </Link>
                  </SidebarMenuButton>
                  {link.showBookingsCounter && bookingsCount > 0 ? (
                    <SidebarMenuBadge
                      className={cn(
                        'border border-haldi/45 bg-haldi/25 text-ink',
                        'font-mono text-[11px] font-bold tabular-nums'
                      )}
                    >
                      {bookingsCount}
                    </SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup className="mt-3 border-t border-indigo/[.14] pt-3">
          <SidebarGroupLabel className="font-mono text-[10px] font-bold uppercase tracking-widest text-indigo">
            Account
          </SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={isActive('/dashboard/settings')}
                tooltip="Settings"
              >
                <Link href="/dashboard/settings">
                  <SettingsIcon className="size-4" aria-hidden />
                  <span>Settings</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>{userMenu}</SidebarFooter>
    </Sidebar>
  );
}
