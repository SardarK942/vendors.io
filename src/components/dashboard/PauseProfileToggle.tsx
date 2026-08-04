'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface Props {
  isActive: boolean;
}

export function PauseProfileToggle({ isActive }: Props) {
  const router = useRouter();
  const switchId = useId();
  const helperId = useId();
  // Optimistic local state — flipped immediately, reverted on error.
  const [optimisticActive, setOptimisticActive] = useState(isActive);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function commit(next: boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/vendor-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: next }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        // Revert optimistic state on failure.
        setOptimisticActive((prev) => !prev);
        setError(json.error ?? 'Failed to update profile status');
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
    // Turning ON is additive — no confirm needed.
    if (next) {
      setOptimisticActive(true);
      void commit(true);
      return;
    }
    // Turning OFF delists from marketplace — gate behind a confirm.
    setConfirmOpen(true);
  }

  return (
    <div className="mt-3 space-y-1" aria-live="polite">
      <div className="flex items-center gap-2">
        <Switch
          id={switchId}
          checked={optimisticActive}
          onCheckedChange={handleChange}
          disabled={loading}
          aria-describedby={helperId}
          aria-label="Search visibility"
        />
        <Label htmlFor={switchId} className="text-sm">
          {optimisticActive ? 'Active — visible in search' : 'Paused'}
        </Label>
      </div>
      <p id={helperId} className="text-pretty text-xs text-ink/60">
        Hides profile from marketplace; existing bookings unaffected.
      </p>
      {error && (
        <p role="alert" aria-live="polite" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(o) => {
          setConfirmOpen(o);
          // Cancelling the confirm leaves optimisticActive untouched (still true).
        }}
        title="Pause This Profile?"
        description="Your profile will be hidden from the marketplace. Existing bookings are unaffected; you can resume anytime."
        confirmLabel="Pause Profile"
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
