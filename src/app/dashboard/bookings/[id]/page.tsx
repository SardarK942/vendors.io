import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { getBookingById } from '@/services/booking.service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatPrice, EVENT_TYPE_LABELS } from '@/lib/utils';
import { QuoteForm } from '@/components/forms/QuoteForm';
import { BookingActions } from '@/components/dashboard/BookingActions';

interface BookingDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function BookingDetailPage({ params }: BookingDetailPageProps) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();

  const role = (profile?.role as 'couple' | 'vendor') || 'couple';

  const result = await getBookingById(supabase, id, user.id);
  if (result.error || !result.data) notFound();

  const booking = result.data;

  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('business_name, slug, category, user_id')
    .eq('id', booking.vendor_profile_id)
    .single();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {role === 'couple' ? vendorProfile?.business_name : 'Booking Request'}
          </h1>
          <p className="text-muted-foreground">
            {EVENT_TYPE_LABELS[booking.event_type] || booking.event_type} on{' '}
            {new Date(booking.event_date).toLocaleDateString()}
          </p>
        </div>
        <Badge
          className={`text-sm ${
            booking.status === 'confirmed'
              ? 'bg-emerald-100 text-emerald-800'
              : booking.status === 'pending'
                ? 'bg-yellow-100 text-yellow-800'
                : ''
          }`}
        >
          {booking.status.replace('_', ' ')}
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Details Card */}
        <Card>
          <CardHeader>
            <CardTitle>Event Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span>{new Date(booking.event_date).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Event Type</span>
              <span>{EVENT_TYPE_LABELS[booking.event_type] || booking.event_type}</span>
            </div>
            {booking.guest_count && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Guests</span>
                <span>{booking.guest_count}</span>
              </div>
            )}
            {(booking.budget_min || booking.budget_max) && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Budget</span>
                <span>
                  {booking.budget_min && formatPrice(booking.budget_min)}
                  {booking.budget_min && booking.budget_max && ' – '}
                  {booking.budget_max && formatPrice(booking.budget_max)}
                </span>
              </div>
            )}
            {booking.special_requests && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">Special Requests</p>
                  <p className="mt-1 text-sm">{booking.special_requests}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Quote / Payment Card */}
        <Card>
          <CardHeader>
            <CardTitle>{booking.vendor_quote_amount ? 'Quote' : 'Awaiting Quote'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {booking.vendor_quote_amount ? (
              <>
                <p className="text-3xl font-bold">{formatPrice(booking.vendor_quote_amount)}</p>
                {booking.vendor_quote_notes && (
                  <p className="text-sm text-muted-foreground">{booking.vendor_quote_notes}</p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">
                {role === 'couple'
                  ? 'Waiting for the vendor to submit a quote...'
                  : 'Submit a quote for this booking request.'}
              </p>
            )}

            {/* Vendor: Show quote form if pending */}
            {role === 'vendor' && booking.status === 'pending' && (
              <>
                <Separator />
                <QuoteForm bookingId={booking.id} />
              </>
            )}

            {/* Contact info (only shown when revealed) */}
            {role === 'vendor' && booking.couple_contact_revealed && (
              <div className="rounded-lg bg-green-50 p-4">
                <p className="text-sm font-medium text-green-800">Contact Information</p>
                {booking.couple_phone && <p className="text-sm">Phone: {booking.couple_phone}</p>}
                {booking.couple_email && <p className="text-sm">Email: {booking.couple_email}</p>}
              </div>
            )}

            {/* Actions */}
            <BookingActions booking={booking} role={role} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
