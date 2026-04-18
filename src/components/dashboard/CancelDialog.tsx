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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CancelDialogProps {
  bookingId: string;
  role: 'couple' | 'vendor';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type Fault = 'none' | 'vendor_fault' | 'force_majeure';

const VENDOR_FAULT_OPTIONS: { value: Fault; label: string; explain: string }[] = [
  {
    value: 'none',
    label: 'Scheduling conflict / unavailable',
    explain: 'No strike. Couple gets 100% refund.',
  },
  {
    value: 'force_majeure',
    label: 'Medical / emergency',
    explain: 'No strike. Couple gets 100% refund.',
  },
  {
    value: 'vendor_fault',
    label: 'Overbooked / same-day cancel',
    explain: 'Counts toward 2-strike freeze. Couple gets 100% refund.',
  },
];

export function CancelDialog({
  bookingId,
  role,
  open,
  onOpenChange,
  onSuccess,
}: CancelDialogProps) {
  const [reason, setReason] = useState('');
  const [fault, setFault] = useState<Fault>('none');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    const body: { reason?: string; fault?: Fault } = {};
    if (reason.trim()) body.reason = reason.trim();
    if (role === 'vendor') body.fault = fault;

    const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || 'Cancel failed');
      setLoading(false);
      return;
    }

    const refund = data.data?.refund_amount_cents;
    toast.success(
      refund && refund > 0
        ? `Cancelled. Refund of $${(refund / 100).toFixed(2)} issued.`
        : 'Cancelled.'
    );
    setLoading(false);
    onOpenChange(false);
    setReason('');
    setFault('none');
    onSuccess?.();
  };

  const selectedOption = VENDOR_FAULT_OPTIONS.find((o) => o.value === fault);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel booking</DialogTitle>
          <DialogDescription>
            {role === 'couple'
              ? 'Refund amount is determined by our cancellation policy and how close to the event you are.'
              : 'Please tell us why. This determines whether the cancel counts as vendor fault.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {role === 'vendor' && (
            <div className="space-y-2">
              <Label>Reason type</Label>
              <Select value={fault} onValueChange={(v) => setFault(v as Fault)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VENDOR_FAULT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedOption && (
                <p className="text-xs text-muted-foreground">{selectedOption.explain}</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Note (optional)</Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Any details you want to share"
              rows={3}
              maxLength={1000}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Keep booking
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Cancelling...' : 'Cancel booking'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
