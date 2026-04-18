'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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

  const handleSubmit = async () => {
    if (reason.trim().length < 10) {
      toast.error('Please describe the issue (min 10 characters).');
      return;
    }

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
    onOpenChange(false);
    setReason('');
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report an issue</DialogTitle>
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
          />
          <p className="text-xs text-muted-foreground">{reason.length} / 2000</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Filing...' : 'File dispute'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
