'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  /** Current booking total in cents. Pre-fills the total input. */
  currentTotalCents: number;
  /** Called after a successful POST — parent should re-fetch/revalidate. */
  onSuccess: () => void;
}

export function CounterModal({ open, onClose, bookingId, currentTotalCents, onSuccess }: Props) {
  const [total, setTotal] = useState(currentTotalCents / 100);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form each time the modal opens
  useEffect(() => {
    if (open) {
      setTotal(currentTotalCents / 100);
      setNote('');
      setError(null);
    }
  }, [open, currentTotalCents]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/counter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totalCents: Math.round(total * 100),
          note: note.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? 'Something went wrong. Please try again.');
        return;
      }
      onSuccess();
      onClose();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send a counter-offer</DialogTitle>
          <DialogDescription>
            Propose a new total. The vendor will have 72 hours to respond.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="counter-total" className="text-sm font-medium">
              Your proposed total (USD)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
              <input
                id="counter-total"
                type="number"
                step="1"
                min="1"
                required
                value={total}
                onChange={(e) => setTotal(Number(e.target.value))}
                className="w-full rounded-md border bg-background py-2 pl-7 pr-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="counter-note" className="text-sm font-medium">
              Note{' '}
              <span className="font-normal text-muted-foreground">(optional, max 200 chars)</span>
            </label>
            <textarea
              id="counter-note"
              maxLength={200}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Explain your counter-offer…"
              className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <p className="text-right text-xs text-muted-foreground">{note.length}/200</p>
          </div>

          {error && (
            <p className="text-sm font-medium" style={{ color: '#D1006C' }}>
              {error}
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              className="bg-cream"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Sending…' : 'Send counter-offer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CounterModal;
