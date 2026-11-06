'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Bell,
  BookOpen,
  Calendar,
  CreditCard,
  Heart,
  Home,
  Package,
  PartyPopper,
  Ruler,
  Settings as SettingsIcon,
  ShoppingBag,
  User,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
import { SHOP_ENABLED } from '@/lib/flags';

type Role = 'couple' | 'vendor';

interface Props {
  role: Role;
  hasBusiness: boolean;
  businessAnchor: React.ReactNode;
  userMenu: React.ReactNode;
  bookingsCount: number;
  hasUnreadNotifications: boolean;
  /** Bridal-wear vendors get the product Shop entry (prototype gate). */
  isBridalWear?: boolean;
  /** Local bridal-wear vendors get the Payouts (Stripe Connect) entry. */
  isLocalBridalVendor?: boolean;
}

interface LinkDef {
  href: string;
  label: string;
  icon: LucideIcon;
  showBookingsCounter?: boolean;
  showUnreadDot?: boolean;
}

// Figma nav item: Schibsted body label, ink text, pale-indigo hover; the active
// item is a solid indigo pill with cream label + icon. (Figma's literal
// dark-text-on-indigo is a contrast bug — cream reads far better.)
const navButtonClass = cn(
  'font-sans text-[13px] text-ink hover:bg-indigo/5 hover:text-ink',
  'data-[active=true]:bg-indigo data-[active=true]:text-cream',
  'data-[active=true]:hover:bg-indigo data-[active=true]:hover:text-cream'
);

function workspaceLinks(
  role: Role,
  isBridalWear: boolean,
  isLocalBridalVendor: boolean
): LinkDef[] {
  const links: LinkDef[] = [
    { href: '/dashboard', label: 'Home', icon: Home },
    { href: '/dashboard/bookings', label: 'Bookings', icon: BookOpen, showBookingsCounter: true },
  ];
  if (role === 'couple') {
    links.splice(1, 0, { href: '/dashboard/events', label: 'My Event', icon: PartyPopper });
    if (SHOP_ENABLED) {
      links.push({ href: '/dashboard/measurements', label: 'Measurements', icon: Ruler });
    }
    links.push({ href: '/dashboard/saved', label: 'Saved', icon: Heart });
  }
  links.push({
    href: '/dashboard/notifications',
    label: 'Notifications',
    icon: Bell,
    showUnreadDot: true,
  });
  if (role === 'vendor') {
    links.push({ href: '/dashboard/profile/calendar', label: 'Calendar', icon: Calendar });
    // Bridal-wear vendors sell products through the Shop, not service packages.
    if (!isBridalWear) {
      links.push({ href: '/dashboard/profile/packages', label: 'Packages', icon: Package });
    }
    links.push(
      { href: '/dashboard/money', label: 'Business Analytics', icon: BarChart3 },
      { href: '/dashboard/profile', label: 'Profile', icon: User }
    );
    // Prototype: the product Shop is bridal-wear only. Bridal vendors onboard
    // into the shop, so their Shop link is shown regardless of SHOP_ENABLED
    // (the buyer-side Shop nav + couple Measurements stay flag-gated).
    if (isBridalWear) {
      links.splice(links.length - 1, 0, {
        href: '/dashboard/profile/shop',
        label: 'Shop',
        icon: ShoppingBag,
      });
    }
    if (isLocalBridalVendor && SHOP_ENABLED) {
      links.splice(links.length - 1, 0, {
        href: '/dashboard/profile/payments',
        label: 'Payouts',
        icon: CreditCard,
      });
    }
  }
  return links;
}

export function SidebarNav({
  role,
  hasBusiness,
  businessAnchor,
  userMenu,
  bookingsCount,
  hasUnreadNotifications,
  isBridalWear = false,
  isLocalBridalVendor = false,
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
    <Sidebar collapsible="icon" className="border-r border-hairline">
      {/* The sidebar now owns the brand wordmark (the floating BaazarChrome was
          removed from the dashboard). */}
      <SidebarHeader className="gap-0 p-0">
        <Link
          href="/"
          aria-label="Baazar home"
          className="flex items-center border-b border-hairline px-3 py-3.5"
        >
          <span className="font-display text-2xl font-medium lowercase tracking-tight text-ink">
            baazar<span className="text-hot-pink">.</span>
          </span>
        </Link>
        {role === 'vendor' && hasBusiness ? businessAnchor : null}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="font-mono text-[10px] font-bold uppercase tracking-widest text-indigo">
            Workspace
          </SidebarGroupLabel>
          <SidebarMenu>
            {workspaceLinks(role, isBridalWear, isLocalBridalVendor).map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <SidebarMenuItem key={link.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={active}
                    tooltip={link.label}
                    className={navButtonClass}
                  >
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

        <SidebarGroup className="mt-3 border-t border-hairline pt-3">
          <SidebarGroupLabel className="font-mono text-[10px] font-bold uppercase tracking-widest text-indigo">
            Account
          </SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={isActive('/dashboard/settings')}
                tooltip="Settings"
                className={navButtonClass}
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

      <SidebarFooter className="border-t border-hairline">{userMenu}</SidebarFooter>
    </Sidebar>
  );
}
