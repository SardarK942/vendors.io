'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Bell, ChevronDown } from 'lucide-react';
import StaggeredMenu from '@/components/ui/StaggeredMenu';

type DemoState = 'anon' | 'couple' | 'vendor';

const itemsByState: Record<DemoState, { label: string; ariaLabel: string; link: string }[]> = {
  anon: [
    { label: 'Home', ariaLabel: 'Go to home', link: '/' },
    { label: 'Browse Vendors', ariaLabel: 'Browse vendors', link: '/vendors' },
    { label: 'Log In', ariaLabel: 'Log in to your account', link: '/login' },
    { label: 'Sign Up', ariaLabel: 'Create an account', link: '/signup' },
  ],
  couple: [
    { label: 'Home', ariaLabel: 'Go to home', link: '/' },
    { label: 'Browse Vendors', ariaLabel: 'Browse vendors', link: '/vendors' },
    { label: 'Dashboard', ariaLabel: 'Open your dashboard', link: '/dashboard' },
    { label: 'Sign Out', ariaLabel: 'Sign out', link: '/signout' },
  ],
  vendor: [
    { label: 'Home', ariaLabel: 'Go to home', link: '/' },
    { label: 'Browse Vendors', ariaLabel: 'Browse vendors', link: '/vendors' },
    { label: 'Dashboard', ariaLabel: 'Open your dashboard', link: '/dashboard' },
    {
      label: 'Add Business',
      ariaLabel: 'Add another business',
      link: '/dashboard/profile/setup?next=true',
    },
    { label: 'Sign Out', ariaLabel: 'Sign out', link: '/signout' },
  ],
};

const CASCADE = ['#F4ECDC', '#2E3DA3'];
const ACCENT = '#D1006C';
const INK = '#1c1816';

function BaazarWordmark() {
  return (
    <Link href="/" className="flex items-center">
      <span className="font-display text-2xl font-medium lowercase tracking-tight text-ink">
        baazar<span className="text-hot-pink">.</span>
      </span>
    </Link>
  );
}

function MockSwitcherPill() {
  return (
    <button
      type="button"
      className="flex items-center gap-1.5 rounded-full border border-ink/15 bg-cream-soft/70 px-3 py-1.5 text-sm font-medium text-ink hover:bg-cream-soft"
    >
      <span className="h-2 w-2 rounded-full bg-indigo" />
      Sardar’s Studio
      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
    </button>
  );
}

function MockBell() {
  return (
    <button
      type="button"
      aria-label="Notifications"
      className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-ink/5"
    >
      <Bell className="h-5 w-5" />
      <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-hot-pink" />
    </button>
  );
}

export default function StaggeredMenuDemoPage() {
  const [state, setState] = useState<DemoState>('anon');
  const items = itemsByState[state];

  const extras =
    state === 'anon' ? null : (
      <>
        {state === 'vendor' && <MockSwitcherPill />}
        <MockBell />
      </>
    );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-cream">
      <div className="pointer-events-auto fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border border-ink/15 bg-cream-soft/95 px-2 py-1.5 text-xs font-medium shadow-sm backdrop-blur">
        <span className="px-1 text-ink/60">View as:</span>
        {(['anon', 'couple', 'vendor'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setState(s)}
            className={`rounded-full px-3 py-1 transition-colors ${
              state === s ? 'bg-ink text-cream' : 'text-ink hover:bg-ink/10'
            }`}
          >
            {s === 'anon' ? 'Anonymous' : s === 'couple' ? 'Couple' : 'Vendor (multi)'}
          </button>
        ))}
      </div>

      <main className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
        <p className="text-sm uppercase tracking-[0.18em] text-ink/50">Sandbox preview</p>
        <h1 className="mt-3 font-display text-5xl tracking-tight text-ink md:text-7xl">
          baazar<span className="text-hot-pink">.</span>
        </h1>
        <p className="mt-4 max-w-md text-base text-ink/70">
          Tap “Menu” in the top right to see the StaggeredMenu cascade. Switch demo state to preview
          the anonymous, couple, and vendor variants.
        </p>
      </main>

      <StaggeredMenu
        key={state}
        position="right"
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
        headerExtras={extras}
      />
    </div>
  );
}
