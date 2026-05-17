'use client';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';

interface Props {
  overlapCount: number;
  capacity: number;
}

export function ConflictWarning({ overlapCount, capacity }: Props) {
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <h3 className="font-semibold">Heads up — this conflicts with an existing booking.</h3>
          <p className="text-sm mt-1">
            Accepting will put you over your concurrent capacity ({overlapCount} overlapping, you
            allow {capacity}).{' '}
            <Link href="/dashboard/profile/calendar" className="underline">
              View calendar →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
