'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

interface Props {
  isActive: boolean;
}

export function PauseProfileToggle({ isActive }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/vendor-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive }),
      });
      if (!res.ok) {
        const json = await res.json();
        setError(json.error ?? 'Failed to update profile status');
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
    <div className="mt-3 space-y-1">
      <Button size="sm" onClick={toggle} disabled={loading} variant={isActive ? 'secondary' : 'default'}>
        {loading ? '…' : isActive ? 'Pause profile' : 'Resume profile'}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
