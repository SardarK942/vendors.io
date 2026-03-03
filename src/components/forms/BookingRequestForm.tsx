'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { EVENT_TYPES, EVENT_TYPE_LABELS } from '@/lib/utils';

interface BookingRequestFormProps {
  vendorProfileId: string;
  vendorName: string;
}

export function BookingRequestForm({ vendorProfileId, vendorName }: BookingRequestFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);

    const payload = {
      vendorProfileId,
      eventDate: formData.get('eventDate') as string,
      eventType: formData.get('eventType') as string,
      guestCount: formData.get('guestCount') ? Number(formData.get('guestCount')) : undefined,
      budgetMin: formData.get('budgetMin')
        ? Math.round(Number(formData.get('budgetMin')) * 100)
        : undefined,
      budgetMax: formData.get('budgetMax')
        ? Math.round(Number(formData.get('budgetMax')) * 100)
        : undefined,
      specialRequests: (formData.get('specialRequests') as string) || undefined,
      couplePhone: (formData.get('phone') as string) || undefined,
      coupleEmail: (formData.get('email') as string) || undefined,
    };

    const res = await fetch('/api/bookings/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      toast.error(data.error || 'Failed to submit request');
      setLoading(false);
      return;
    }

    toast.success('Booking request submitted! The vendor will be notified.');
    router.push('/dashboard/bookings');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request Booking from {vendorName}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="eventDate">Event Date</Label>
              <Input id="eventDate" name="eventDate" type="date" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eventType">Event Type</Label>
              <Select name="eventType" required>
                <SelectTrigger>
                  <SelectValue placeholder="Select event type" />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {EVENT_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="guestCount">Guest Count (estimated)</Label>
            <Input id="guestCount" name="guestCount" type="number" min={1} placeholder="200" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="budgetMin">Budget Min ($)</Label>
              <Input id="budgetMin" name="budgetMin" type="number" min={0} placeholder="500" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="budgetMax">Budget Max ($)</Label>
              <Input id="budgetMax" name="budgetMax" type="number" min={0} placeholder="2000" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Your Phone</Label>
              <Input id="phone" name="phone" type="tel" placeholder="(312) 555-0123" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Your Email</Label>
              <Input id="email" name="email" type="email" placeholder="you@example.com" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="specialRequests">Special Requests</Label>
            <Textarea
              id="specialRequests"
              name="specialRequests"
              rows={3}
              placeholder="Any details about your event, preferences, or questions..."
            />
          </div>

          <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
            <p>
              Your contact information will only be shared with the vendor after you pay a small
              hold deposit. The vendor has 72 hours to respond with a quote.
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Submitting...' : 'Submit Booking Request'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
