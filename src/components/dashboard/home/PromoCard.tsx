import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PromoCardProps {
  href?: string;
  /** Pulse the CTA (e.g. while the vendor has no packages yet). */
  pulse?: boolean;
}

export function PromoCard({
  href = '/dashboard/profile/packages/new',
  pulse = false,
}: PromoCardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-indigo p-6 text-cream">
      <div className="absolute -right-10 -top-10 size-40 rounded-full bg-cream/10" />
      <span className="flex size-11 items-center justify-center rounded-xl bg-cream/15">
        <Gift className="size-5 text-cream" aria-hidden="true" />
      </span>
      <h3 className="mt-4 font-display text-2xl">Create your Packages</h3>
      <p className="mt-1 text-sm text-cream/80">Add packages couples can book in one click.</p>
      <Button
        asChild
        className={cn('mt-5 bg-haldi text-ink hover:bg-haldi/90', pulse && 'pulse-pink-loop')}
      >
        <Link href={href}>
          Create New Package
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}
