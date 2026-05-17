'use client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useRouter } from 'next/navigation';

export function BlockDateForm() {
  const router = useRouter();
  const [date, setDate] = useState('');
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
    setDate('');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border p-4">
      <h2 className="font-semibold">Block a date</h2>
      <div>
        <Label htmlFor="block-date">Date</Label>
        <Input
          id="block-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
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
            <Input
              id="start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="end">End</Label>
            <Input
              id="end"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
            />
          </div>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={submitting || !date}>
        {submitting ? 'Blocking…' : 'Block this date'}
      </Button>
    </form>
  );
}
