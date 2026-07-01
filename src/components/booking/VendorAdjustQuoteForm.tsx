'use client';

import { useId, useState } from 'react';
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
import { fmtUSDWithCents } from '@/lib/intl';

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
  /**
   * When the booking has no existing quote (custom request from a couple — status
   * 'pending_quote'), copy shifts from "adjust an existing quote" to "send a first
   * quote". Also hides the misleading "Current: $0.00" caption and prefills the
   * total field blank instead of "0.00".
   */
  isFirstQuote?: boolean;
}

export function VendorAdjustQuoteForm({
  bookingId,
  currentTotalCents,
  onSuccess,
  isFirstQuote = false,
}: Props) {
  const reasonId = useId();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [newTotal, setNewTotal] = useState(
    isFirstQuote ? '' : (currentTotalCents / 100).toFixed(2)
  );
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
        const json = await res.json().catch(() => ({}));
        toast.error(
          json.error?.message ??
            (isFirstQuote
              ? 'We couldn’t send your quote — please try again.'
              : 'We couldn’t send your adjusted quote — please try again.')
        );
        return;
      }

      toast.success(isFirstQuote ? 'Quote sent to customer' : 'Adjusted quote sent to customer');
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
        <Label htmlFor="new_total">{isFirstQuote ? 'Quote total ($)' : 'New Total ($)'}</Label>
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
          placeholder={isFirstQuote ? 'e.g. 1500.00' : undefined}
        />
        {isFirstQuote ? (
          <p className="text-xs text-muted-foreground">
            The couple pays a 5% deposit through Baazar to lock in the date. You&rsquo;ll settle the
            remaining 95% with them directly.
          </p>
        ) : (
          <p className="text-xs tabular-nums text-muted-foreground">
            Current: {fmtUSDWithCents(currentTotalCents)}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={reasonId}>Reason</Label>
        <Select value={reason} onValueChange={setReason} required>
          <SelectTrigger id={reasonId}>
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
        {loading ? 'Sending…' : isFirstQuote ? 'Send quote' : 'Send Adjusted Quote'}
      </Button>
    </form>
  );
}
