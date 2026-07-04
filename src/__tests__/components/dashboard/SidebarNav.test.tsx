import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SidebarNav } from '@/components/dashboard/SidebarNav';
import { SidebarProvider } from '@/components/ui/sidebar';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

// jsdom has no matchMedia; SidebarProvider's useIsMobile hook needs it.
window.matchMedia =
  window.matchMedia ||
  ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as MediaQueryList);

function renderNav(props: Partial<React.ComponentProps<typeof SidebarNav>> = {}) {
  return render(
    <SidebarProvider>
      <SidebarNav
        role="vendor"
        hasBusiness={false}
        businessAnchor={null}
        userMenu={null}
        bookingsCount={0}
        hasUnreadNotifications={false}
        {...props}
      />
    </SidebarProvider>
  );
}

describe('SidebarNav', () => {
  it('renders all 7 workspace links + Settings for a vendor', () => {
    renderNav({ role: 'vendor' });

    const vendorLinks = [
      'Home',
      'Bookings',
      'Notifications',
      'Calendar',
      'Packages',
      'Business Analytics',
      'Profile',
    ];
    vendorLinks.forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders 4 workspace links + Settings for a couple, without vendor-only links', () => {
    renderNav({ role: 'couple' });

    const coupleLinks = ['Home', 'Bookings', 'Saved', 'Notifications'];
    coupleLinks.forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
    expect(screen.getByText('Settings')).toBeInTheDocument();

    ['Calendar', 'Packages', 'Business Analytics', 'Profile'].forEach((label) => {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    });
  });

  it('shows the bookings badge with the count when bookingsCount is provided', () => {
    renderNav({ bookingsCount: 3 });
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows the unread dot when hasUnreadNotifications is true', () => {
    renderNav({ hasUnreadNotifications: true });
    expect(screen.getByLabelText('Unread notifications')).toBeInTheDocument();
  });
});
