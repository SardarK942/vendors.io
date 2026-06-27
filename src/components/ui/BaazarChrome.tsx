'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { BusinessSwitcher, type SwitcherBusiness } from '@/components/dashboard/BusinessSwitcher';
import StaggeredMenu from '@/components/ui/StaggeredMenu';

interface BusinessesResponse {
  role: 'couple' | 'vendor' | 'admin' | null;
  activeBusinessId: string | null;
  businesses: SwitcherBusiness[];
  totalCount: number;
}

interface MenuItem {
  label: string;
  ariaLabel: string;
  link: string;
}

// Baazar palette — see [[baazar_palette_locked_m_plus]]
const CASCADE = ['#F4ECDC', '#2E3DA3']; // cream-soft → indigo
const ACCENT = '#D1006C'; // hot-pink
const INK = '#1c1816';

function BaazarWordmark() {
  return (
    <Link href="/" className="flex items-center" aria-label="Baazar home">
      <span className="font-display text-2xl font-medium lowercase tracking-tight text-ink">
        baazar<span className="text-hot-pink">.</span>
      </span>
    </Link>
  );
}

export function BaazarChrome() {
  const pathname = usePathname();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [businessState, setBusinessState] = useState<BusinessesResponse | null>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
    };
    void getUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  // Mirror Navbar's sub-project I §3 fetch: businesses drive switcher visibility
  // + the "Add another business" menu item.
  useEffect(() => {
    if (!user) {
      setBusinessState(null);
      return;
    }
    let cancelled = false;
    const fetchState = async () => {
      try {
        const res = await fetch('/api/users/me/businesses', { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as BusinessesResponse;
        if (!cancelled) setBusinessState(data);
      } catch {
        // Silent — switcher will reappear on next route change.
      }
    };
    void fetchState();
    return () => {
      cancelled = true;
    };
  }, [user, pathname]);

  const isVendor = businessState?.role === 'vendor';
  const showSwitcher =
    isVendor && businessState!.totalCount > 1 && businessState!.activeBusinessId !== null;

  const items: MenuItem[] = useMemo(() => {
    const base: MenuItem[] = [
      { label: 'Home', ariaLabel: 'Go to home', link: '/' },
      { label: 'Browse Vendors', ariaLabel: 'Browse vendors', link: '/vendors' },
    ];
    if (!user) {
      return [
        ...base,
        { label: 'Log In', ariaLabel: 'Log in to your account', link: '/login' },
        { label: 'Sign Up', ariaLabel: 'Create an account', link: '/signup' },
      ];
    }
    const authed: MenuItem[] = [
      ...base,
      { label: 'Dashboard', ariaLabel: 'Open your dashboard', link: '/dashboard' },
    ];
    if (isVendor) {
      authed.push({
        label: 'Add Business',
        ariaLabel: 'Add another business',
        link: '/dashboard/profile/setup?next=true',
      });
    }
    authed.push({ label: 'Sign Out', ariaLabel: 'Sign out', link: '/signout' });
    return authed;
  }, [user, isVendor]);

  const headerExtras =
    user && businessState ? (
      <>
        {showSwitcher && (
          <BusinessSwitcher
            activeBusinessId={businessState.activeBusinessId!}
            businesses={businessState.businesses}
          />
        )}
        <NotificationBell userId={user.id} />
      </>
    ) : null;

  return (
    <StaggeredMenu
      position="right"
      isFixed
      items={items}
      socialItems={[]}
      displaySocials={false}
      displayItemNumbering
      colors={CASCADE}
      accentColor={ACCENT}
      menuButtonColor={INK}
      openMenuButtonColor={INK}
      changeMenuColorOnOpen={false}
      logo={<BaazarWordmark />}
      headerExtras={headerExtras}
    />
  );
}

export default BaazarChrome;
