'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface DisputeDialogProps {
  bookingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function DisputeDialog({ bookingId, open, onOpenChange, onSuccess }: DisputeDialogProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [finalConfirmOpen, setFinalConfirmOpen] = useState(false);

  const openFinalConfirm = () => {
    if (reason.trim().length < 10) {
      toast.error('Please describe the issue (min 10 characters).');
      return;
    }
    setFinalConfirmOpen(true);
  };

  const handleSubmit = async () => {
    setLoading(true);
    const res = await fetch(`/api/bookings/${bookingId}/dispute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || 'Failed to file dispute');
      setLoading(false);
      return;
    }

    toast.success('Dispute filed. Our team will review and contact you within 3 business days.');
    setLoading(false);
    setFinalConfirmOpen(false);
    onOpenChange(false);
    setReason('');
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report an Issue</DialogTitle>
          <DialogDescription>
            Use this only if the vendor was a no-show or significantly failed to deliver. The
            booking will be paused and funds held in escrow while our team reviews.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="dispute-reason">What happened?</Label>
          <Textarea
            id="dispute-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Be specific. What did the vendor agree to? What actually happened? Any photos or messages we should know about?"
            rows={6}
            maxLength={2000}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {reason.length} / 2000
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={openFinalConfirm} disabled={loading}>
            {loading ? 'Filing…' : 'File Dispute'}
          </Button>
        </DialogFooter>
      </DialogContent>

      <ConfirmDialog
        open={finalConfirmOpen}
        onOpenChange={setFinalConfirmOpen}
        title="File This Dispute?"
        description="Funds will be frozen in escrow while our team reviews. Both parties will be contacted within 3 business days."
        confirmLabel="File Dispute"
        destructive
        typedConfirm="FILE DISPUTE"
        busy={loading}
        onConfirm={handleSubmit}
      />
    </Dialog>
  );
}
