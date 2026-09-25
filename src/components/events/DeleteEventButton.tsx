'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface DeleteEventButtonProps {
  eventId: string;
}

export function DeleteEventButton({ eventId }: DeleteEventButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: null }));
        throw new Error(body?.error ?? 'Something went wrong. Please try again.');
      }
      router.push('/dashboard/events');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-mono text-[10px] font-bold uppercase tracking-widest text-ink-soft underline decoration-ink-soft/30 underline-offset-4 transition-colors hover:text-error hover:decoration-error/50"
      >
        Delete event
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return;
          setOpen(next);
          if (!next) setError(null);
        }}
        title="Delete this event?"
        description={
          <>
            This removes the event and its plan, functions, budget, and tasks. Any vendor bookings
            you&apos;ve made stay in your bookings.
            {error && <span className="mt-2 block font-medium text-error">{error}</span>}
          </>
        }
        confirmLabel="Delete event"
        cancelLabel="Keep event"
        destructive
        busy={busy}
        onConfirm={handleConfirm}
      />
    </>
  );
}
