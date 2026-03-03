'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface QuoteFormProps {
  bookingId: string;
}

export function QuoteForm({ bookingId }: QuoteFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const quoteAmount = Math.round(Number(formData.get('quoteAmount')) * 100); // Convert to cents

    const res = await fetch(`/api/bookings/${bookingId}/quote`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteAmount,
        quoteNotes: formData.get('quoteNotes') || undefined,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      toast.error(data.error || 'Failed to submit quote');
      setLoading(false);
      return;
    }

    toast.success('Quote submitted! The couple will be notified.');
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="quoteAmount">Quote Amount ($)</Label>
        <Input
          id="quoteAmount"
          name="quoteAmount"
          type="number"
          min={1}
          step={1}
          required
          placeholder="1500"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="quoteNotes">Notes for the Couple</Label>
        <Textarea
          id="quoteNotes"
          name="quoteNotes"
          rows={3}
          placeholder="Package details, what's included, any conditions..."
        />
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? 'Submitting...' : 'Submit Quote'}
      </Button>
    </form>
  );
}
