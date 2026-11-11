'use client';

import { usePathname } from 'next/navigation';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { TopBar } from '@/components/dashboard/TopBar';

interface DashboardShellProps {
  /** The dashboard sidebar nav, built on the server with role/counts/menus. */
  sidebar: React.ReactNode;
  /** Intercepting-route slide-over panel (@panel slot). */
  panel: React.ReactNode;
  /** Persisted sidebar open/closed state (from the sidebar_state cookie). */
  defaultSidebarOpen: boolean;
  /** Current user id — drives the TopBar notification bell + dropdown. */
  userId: string;
  children: React.ReactNode;
}

/**
 * Chooses between the full dashboard chrome and the focused onboarding shell.
 *
 * The vendor onboarding wizard (`/dashboard/profile/setup/**`) runs in a
 * focused, chrome-less shell — its own rail + live preview are the whole point.
 * This decision MUST live in a client component keyed on `usePathname()`:
 * the dashboard `layout.tsx` is a shared segment that the App Router preserves
 * across client-side navigation and does NOT re-render. Branching on the
 * pathname there was sticky — once the wizard rendered the chrome-less shell,
 * navigating back to any `/dashboard/*` page (e.g. the wizard's own
 * "Save & exit" link) kept that shell, stranding vendors on a dashboard with
 * no sidebar and no way out. `usePathname()` is reactive, so the chrome
 * correctly reappears the instant you leave the wizard.
 */
export function DashboardShell({
  sidebar,
  panel,
  defaultSidebarOpen,
  userId,
  children,
}: DashboardShellProps) {
  const pathname = usePathname();

  if (pathname?.startsWith('/dashboard/profile/setup')) {
    // No chrome and no sidebar here — the wizard's own layout provides its
    // logo + rail + Save & exit.
    return <div className="min-h-screen bg-cream">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-cream">
      {/* 14rem ≈ 224px to match the Figma sidebar width. */}
      <SidebarProvider
        defaultOpen={defaultSidebarOpen}
        style={{ '--sidebar-width': '14rem' } as React.CSSProperties}
      >
        {sidebar}
        <SidebarInset className="bg-cream">
          <TopBar userId={userId} />
          <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</div>
        </SidebarInset>
      </SidebarProvider>
      {panel}
    </div>
  );
}
