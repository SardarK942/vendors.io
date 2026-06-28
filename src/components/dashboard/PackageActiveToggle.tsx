'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

interface Props {
  packageId: string;
  isActive: boolean;
}

export function PackageActiveToggle({ packageId, isActive }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/packages/${packageId}/is-active`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive }),
      });
      if (!res.ok) {
        const json = await res.json();
        setError(json.error?.message ?? 'Failed to update package status');
        return;
      }
      router.refresh();
    } catch {
      setError('Network error, please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        size="sm"
        variant={isActive ? 'secondary' : 'outline'}
        onClick={toggle}
        disabled={loading}
      >
        {loading ? '…' : isActive ? 'Deactivate' : 'Activate'}
      </Button>
      {error && <p className="text-xs text-destructive max-w-[160px]">{error}</p>}
    </div>
  );
}
