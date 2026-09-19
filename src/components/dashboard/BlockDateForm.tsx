'use client';
import { useState } from 'react';
import { useQueryState, parseAsString } from 'nuqs';
import { Input } from '@/components/ui/input';
import { TimeInput } from '@/components/ui/TimeInput';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useRouter } from 'next/navigation';

// Mirrors the shadcn <Input> default styling so the TimeInputs (a bare native
// input under the hood) keep visual parity with the sibling date <Input>.
const SHADCN_INPUT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm';

export function BlockDateForm() {
  const router = useRouter();
  // Date is URL-synced so deep links / shareable URLs prefill the block form
  // (e.g. the calendar grid links here with ?date=YYYY-MM-DD).
  const [date, setDate] = useQueryState(
    'date',
    parseAsString.withDefault('').withOptions({ clearOnDefault: true })
  );
  const [fullDay, setFullDay] = useState(true);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const body = fullDay
      ? { mode: 'full_day' as const, date }
      : { mode: 'time_range' as const, date, start_time: startTime, end_time: endTime };
    const res = await fetch('/api/vendor-calendar/block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSubmitting(false);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: 'Block failed' }));
      setError(errData.error);
      return;
    }
    void setDate('');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-md p-4 shadow-sm">
      <h2 className="font-semibold">Block a Date</h2>
      <div>
        <Label htmlFor="block-date">Date</Label>
        <Input
          id="block-date"
          type="date"
          value={date}
          onChange={(e) => void setDate(e.target.value)}
          required
        />
      </div>
      <div className="flex items-center gap-3">
        <Switch checked={fullDay} onCheckedChange={setFullDay} id="full-day" />
        <Label htmlFor="full-day">Block full day</Label>
      </div>
      {!fullDay && (
        <div className="flex gap-3">
          <div>
            <Label htmlFor="start">Start</Label>
            <TimeInput
              id="start"
              value={startTime}
              onChange={setStartTime}
              className={SHADCN_INPUT_CLASS}
              required
            />
          </div>
          <div>
            <Label htmlFor="end">End</Label>
            <TimeInput
              id="end"
              value={endTime}
              onChange={setEndTime}
              className={SHADCN_INPUT_CLASS}
              required
            />
          </div>
        </div>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert" aria-live="assertive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={submitting || !date}>
        {submitting ? 'Blocking…' : 'Block this date'}
      </Button>
    </form>
  );
}
