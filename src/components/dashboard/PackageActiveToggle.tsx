'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface Props {
  packageId: string;
  isActive: boolean;
}

export function PackageActiveToggle({ packageId, isActive }: Props) {
  const router = useRouter();
  const switchId = useId();
  const helperId = useId();
  const [optimisticActive, setOptimisticActive] = useState(isActive);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function commit(next: boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/packages/${packageId}/is-active`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: next }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setOptimisticActive((prev) => !prev);
        setError(json.error?.message ?? 'Failed to update package status');
        return;
      }
      setConfirmOpen(false);
      router.refresh();
    } catch {
      setOptimisticActive((prev) => !prev);
      setError('Network error, please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleChange(next: boolean) {
    if (next) {
      setOptimisticActive(true);
      void commit(true);
      return;
    }
    setConfirmOpen(true);
  }

  return (
    <div className="flex flex-col gap-1" aria-live="polite">
      <div className="flex items-center gap-2">
        <Switch
          id={switchId}
          checked={optimisticActive}
          onCheckedChange={handleChange}
          disabled={loading}
          aria-describedby={helperId}
          aria-label="Package active"
        />
        <Label htmlFor={switchId} className="text-sm">
          {optimisticActive ? 'Active' : 'Hidden'}
        </Label>
      </div>
      <p id={helperId} className="text-xs text-ink/60">
        Hides the package from couples; existing bookings unaffected.
      </p>
      {error && (
        <p role="alert" aria-live="polite" className="max-w-[200px] text-xs text-destructive">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Hide This Package?"
        description="Couples won't see it in your listing. Existing bookings remain. You can reactivate anytime."
        confirmLabel="Hide Package"
        destructive
        busy={loading}
        onConfirm={() => {
          setOptimisticActive(false);
          void commit(false);
        }}
      />
    </div>
  );
}
