'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { TimeInput } from '@/components/ui/TimeInput';
import { fmtDate } from '@/lib/intl';

// Mirrors the shadcn <Input> styling so the bare native TimeInputs match.
const SHADCN_INPUT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm';

interface Props {
  /** The day being booked (YYYY-MM-DD), or null when closed. */
  date: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful create (parent refreshes the calendar). */
  onCreated: (created: { date: string; label: string; couple: string }) => void;
}

export function ManualBookingDialog({ date, open, onOpenChange, onCreated }: Props) {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [eventType, setEventType] = useState('');
  const [startTime, setStartTime] = useState('17:00');
  const [endTime, setEndTime] = useState('21:00');
  const [value, setValue] = useState('');
  const [location, setLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setCustomerName('');
    setCustomerPhone('');
    setEventType('');
    setStartTime('17:00');
    setEndTime('21:00');
    setValue('');
    setLocation('');
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!date) return;
    setError(null);

    const valueDollars = value.trim() === '' ? 0 : Number(value);
    if (!customerName.trim()) return setError('Customer name is required.');
    if (!eventType.trim()) return setError('Event type is required.');
    if (!Number.isFinite(valueDollars) || valueDollars < 0)
      return setError('Enter a valid value, or leave it blank.');

    setSubmitting(true);
    try {
      const res = await fetch('/api/vendor-bookings/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim() || null,
          eventType: eventType.trim(),
          eventDate: date,
          startTime,
          endTime,
          valueDollars,
          location: location.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Could not add booking.' }));
        setError(data.error ?? 'Could not add booking.');
        return;
      }
      toast.success('Booking added to your calendar.');
      onOpenChange(false);
      onCreated({ date, label: eventType.trim(), couple: customerName.trim() });
      reset();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a booking</DialogTitle>
          <DialogDescription>
            {date
              ? `Log an off-platform gig for ${fmtDate(`${date}T12:00:00`, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}. It appears on your calendar and in Bookings, but not in analytics.`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="mb-customer">Customer name</Label>
            <Input
              id="mb-customer"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Aisha & Omar"
              required
            />
          </div>
          <div>
            <Label htmlFor="mb-type">Event type</Label>
            <Input
              id="mb-type"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              placeholder="e.g. Mehndi"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="mb-start">Start</Label>
              <TimeInput
                id="mb-start"
                value={startTime}
                onChange={setStartTime}
                className={SHADCN_INPUT_CLASS}
                required
              />
            </div>
            <div>
              <Label htmlFor="mb-end">End</Label>
              <TimeInput
                id="mb-end"
                value={endTime}
                onChange={setEndTime}
                className={SHADCN_INPUT_CLASS}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="mb-value">Value ($, optional)</Label>
              <Input
                id="mb-value"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="1200"
              />
            </div>
            <div>
              <Label htmlFor="mb-phone">Phone (optional)</Label>
              <Input
                id="mb-phone"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="(312) 555-0199"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="mb-location">Venue / location (optional)</Label>
            <Input
              id="mb-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. The Drake Hotel"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert" aria-live="assertive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={submitting}>
              Add booking
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
