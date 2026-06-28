'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function SetupError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('vendor-onboarding setup error', error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 text-center">
      <h1 className="font-spectral text-balance text-2xl font-bold text-ink">
        We hit a snag setting up your profile
      </h1>
      <p className="mt-3 text-sm text-ink/70">
        {error.message || 'An unexpected error occurred. Your data is safe.'}
      </p>
      {error.digest && (
        <p className="mt-1 font-mono text-xs text-ink/50">Error reference: {error.digest}</p>
      )}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button onClick={reset} variant="outline">
          Try Again
        </Button>
        <Button asChild>
          <Link href="/dashboard">Back to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
