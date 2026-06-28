'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ADJUSTMENT_REASONS = [
  { value: 'travel', label: 'Travel distance' },
  { value: 'guest_count', label: 'Guest count over package' },
  { value: 'peak_date', label: 'Peak-season date' },
  { value: 'custom', label: 'Custom requirements' },
  { value: 'setup_complexity', label: 'Setup complexity' },
  { value: 'discount', label: 'Discount' },
  { value: 'other', label: 'Other' },
] as const;

interface Props {
  bookingId: string;
  currentTotalCents: number;
  onSuccess?: () => void;
}

export function VendorAdjustQuoteForm({ bookingId, currentTotalCents, onSuccess }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [newTotal, setNewTotal] = useState((currentTotalCents / 100).toFixed(2));
  const [reason, setReason] = useState('');
  const [explanation, setExplanation] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) {
      toast.error('Please select a reason');
      return;
    }
    if (reason === 'other' && !explanation.trim()) {
      toast.error('Please provide an explanation when selecting "Other"');
      return;
    }

    const newTotalCents = Math.round(parseFloat(newTotal) * 100);
    const adjustmentAmountCents = newTotalCents - currentTotalCents;

    setLoading(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adjustment_amount_cents: adjustmentAmountCents,
          reason,
          explanation: explanation.trim() || null,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        toast.error(json.error?.message ?? 'Failed to send adjusted quote');
        return;
      }

      toast.success('Adjusted quote sent to customer');
      onSuccess?.();
      router.refresh();
    } catch {
      toast.error('Network error, please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="new_total">New Total ($)</Label>
        <Input
          id="new_total"
          name="new_total"
          type="number"
          min={1}
          step={0.01}
          value={newTotal}
          onChange={(e) => setNewTotal(e.target.value)}
          required
          inputMode="decimal"
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          Current: ${(currentTotalCents / 100).toFixed(2)}
        </p>
      </div>

      <div className="space-y-2">
        <Label>Reason</Label>
        <Select value={reason} onValueChange={setReason} required>
          <SelectTrigger>
            <SelectValue placeholder="Select a reason…" />
          </SelectTrigger>
          <SelectContent>
            {ADJUSTMENT_REASONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {reason === 'other' && (
        <div className="space-y-2">
          <Label htmlFor="explanation">Explanation (required for &ldquo;Other&rdquo;)</Label>
          <Textarea
            id="explanation"
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Describe the reason for your adjustment…"
            required
            autoComplete="off"
          />
        </div>
      )}

      {reason && reason !== 'other' && (
        <div className="space-y-2">
          <Label htmlFor="explanation">Optional note to customer</Label>
          <Textarea
            id="explanation"
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="Any additional context…"
            autoComplete="off"
          />
        </div>
      )}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Sending…' : 'Send Adjusted Quote'}
      </Button>
    </form>
  );
}
