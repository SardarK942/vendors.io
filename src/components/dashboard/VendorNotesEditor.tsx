'use client';

import { useState, useRef, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';

const MAX = 5000;
const WARN = 4500;
const DEBOUNCE_MS = 500;

type Status = 'idle' | 'saving' | 'saved' | 'error';

interface VendorNotesEditorProps {
  bookingEventId: string;
  eventTypeLabel: string;
  initialNotes: string;
}

export function VendorNotesEditor({
  bookingEventId,
  eventTypeLabel,
  initialNotes,
}: VendorNotesEditorProps) {
  const [notes, setNotes] = useState(initialNotes);
  const [status, setStatus] = useState<Status>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = async () => {
    setStatus('saving');
    try {
      const res = await fetch(`/api/booking-events/${bookingEventId}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => {
    if (notes === initialNotes) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(save, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  const tooLong = notes.length > MAX;
  const warning = notes.length > WARN;

  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{eventTypeLabel}</div>
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value.slice(0, MAX))}
        onBlur={() => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          save();
        }}
        placeholder="e.g. customer is vegetarian, prefers minimal posing"
        rows={3}
        className={tooLong ? 'border-red-500' : ''}
      />
      <div className="flex items-center justify-between text-xs">
        <span
          className={
            tooLong ? 'text-red-600' : warning ? 'text-yellow-600' : 'text-muted-foreground'
          }
        >
          {notes.length} / {MAX}
        </span>
        <span className="text-muted-foreground">
          {status === 'saving' && 'Saving…'}
          {status === 'saved' && 'Saved · just now'}
          {status === 'error' && (
            <button onClick={save} className="text-red-600 hover:underline">
              Couldn&rsquo;t save — retry
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
