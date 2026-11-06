import * as React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WelcomeBannerProps {
  name: string;
}

export function WelcomeBanner({ name }: WelcomeBannerProps) {
  return (
    <div className="flex items-center justify-between gap-6 overflow-hidden rounded-2xl border border-hairline bg-cream-soft/60 p-7">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-indigo">
          Welcome back,
        </p>
        <h1 className="font-display text-3xl text-ink">{name}</h1>
        <p className="mt-2 max-w-md text-sm text-ink-muted">
          Manage your bookings, packages, and calendar — all in one place.
        </p>
        <Button asChild className="mt-4">
          <Link href="/dashboard/bookings">
            View bookings
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/dashboard/celebration.png"
        alt=""
        width={240}
        height={154}
        className="hidden shrink-0 sm:block"
      />
    </div>
  );
}
