'use client';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { fmtCount } from '@/lib/intl';

interface Props {
  overlapCount: number;
  capacity: number;
}

export function ConflictWarning({ overlapCount, capacity }: Props) {
  return (
    <div
      className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div>
          <h3 className="font-semibold">Heads up — this conflicts with an existing booking.</h3>
          <p className="mt-1 text-sm">
            Accepting will put you over your concurrent capacity (
            <span className="tabular-nums">{fmtCount(overlapCount)}</span> overlapping, you allow{' '}
            <span className="tabular-nums">{fmtCount(capacity)}</span>).{' '}
            <Link href="/dashboard/profile/calendar" className="underline">
              View calendar →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
