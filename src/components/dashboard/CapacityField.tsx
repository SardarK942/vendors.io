'use client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

interface Props {
  initial: number;
}

export function CapacityField({ initial }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const res = await fetch('/api/vendor-calendar/capacity', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ concurrent_capacity: value }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: 'Update failed' }));
      setError(errData.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2 rounded-md border p-4">
      <h2 className="font-semibold">Concurrent Capacity</h2>
      <p className="text-sm text-muted-foreground">
        Increase this if you run multiple teams. Default 1.
      </p>
      <div className="flex items-end gap-3">
        <div>
          <label className="text-sm">I can handle</label>
          <Input
            type="number"
            min={1}
            max={50}
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            inputMode="numeric"
            autoComplete="off"
            className="w-20"
          />
          <span className="ml-2 text-sm">events at the same time.</span>
        </div>
        <Button onClick={save} disabled={value === initial}>
          Save
        </Button>
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert" aria-live="assertive">
          {error}
        </p>
      )}
    </div>
  );
}
