'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { VendorAdjustQuoteForm } from '@/components/booking/VendorAdjustQuoteForm';

interface Props {
  bookingId: string;
  status: string;
  totalPriceCents: number;
}

export function VendorBookingActions({ bookingId, status, totalPriceCents }: Props) {
  const router = useRouter();
  const [showAdjustForm, setShowAdjustForm] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const isPending = status === 'pending';
  const isDeclined = status === 'adjusted_quote_declined';

  if (!isPending && !isDeclined) return null;

  async function handleAccept() {
    setAccepting(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const json = await res.json();
        toast.error(json.error?.message ?? 'Failed to accept booking');
        return;
      }

      toast.success('Booking accepted. Couple has been notified to pay the deposit.');
      router.refresh();
    } catch {
      toast.error('Network error, please try again.');
    } finally {
      setAccepting(false);
    }
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {isPending ? 'Respond to this booking' : 'Send revised quote'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isPending && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="default"
              className="flex-1"
              onClick={handleAccept}
              disabled={accepting}
            >
              {accepting
                ? 'Accepting...'
                : `Accept at $${(totalPriceCents / 100).toLocaleString()}`}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowAdjustForm((s) => !s)}
            >
              {showAdjustForm ? 'Cancel' : 'Adjust quote'}
            </Button>
          </div>
        )}

        {isDeclined && (
          <Button
            variant="default"
            className="w-full"
            onClick={() => setShowAdjustForm((s) => !s)}
          >
            {showAdjustForm ? 'Cancel' : 'Send revised quote'}
          </Button>
        )}

        {showAdjustForm && (
          <>
            <Separator />
            <VendorAdjustQuoteForm
              bookingId={bookingId}
              currentTotalCents={totalPriceCents}
              onSuccess={() => setShowAdjustForm(false)}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
