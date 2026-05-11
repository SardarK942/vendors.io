import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { getBookingById } from '@/services/booking.service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { formatPrice, EVENT_TYPE_LABELS } from '@/lib/utils';
import { QuoteForm } from '@/components/forms/QuoteForm';
import { BookingActions } from '@/components/dashboard/BookingActions';
import { AdjustmentReview } from '@/components/booking/AdjustmentReview';
import Link from 'next/link';

interface BookingDetailPageProps {
  params: Promise<{ id: string }>;
}

function statusBadgeStyle(status: string) {
  if (status === 'deposit_paid' || status === 'completed') return 'bg-emerald-100 text-emerald-800';
  if (status === 'pending' || status === 'quoted' || status === 'accepted')
    return 'bg-yellow-100 text-yellow-800';
  if (status === 'adjusted_quote_sent') return 'bg-blue-100 text-blue-800';
  if (status === 'adjusted_quote_declined') return 'bg-orange-100 text-orange-800';
  if (status === 'disputed') return 'bg-amber-100 text-amber-900';
  if (status.endsWith('cancelled') || status === 'rejected' || status === 'expired')
    return 'bg-red-100 text-red-800';
  return '';
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

  const { data: existingReview } =
    role === 'couple'
      ? await supabase
          .from('reviews')
          .select('id')
          .eq('booking_request_id', booking.id)
          .maybeSingle()
      : { data: null };

  // Load booking events for new-style bookings (package-driven)
  const { data: bookingEvents } = await supabase
    .from('booking_events')
    .select('*')
    .eq('booking_id', id)
    .order('sequence');

  // For package-driven bookings, compute original subtotal (base + addons before adjustment)
  const bookingAsAny = booking as unknown as Record<string, unknown>;
  const packageBase = (bookingAsAny.package_base_price_cents_snapshot as number) ?? 0;
  const selectedAddons = (bookingAsAny.selected_addons as { price_delta_cents: number }[]) ?? [];
  const addonsSum = selectedAddons.reduce((s: number, a) => s + (a.price_delta_cents ?? 0), 0);
  const originalSubtotal = packageBase + addonsSum;
  const adjustmentAmount = (bookingAsAny.adjustment_amount_cents as number) ?? 0;
  const adjustmentReason = (bookingAsAny.adjustment_reason as string) ?? '';
  const adjustmentExplanation = (bookingAsAny.adjustment_explanation as string | null) ?? null;

  const isPackageBooking = !!(bookingAsAny.package_id || bookingAsAny.package_name_snapshot);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {role === 'couple' ? vendorProfile?.business_name : 'Booking Request'}
          </h1>
          {isPackageBooking ? (
            <p className="text-muted-foreground">
              {(bookingAsAny.package_name_snapshot as string) ?? 'Package Booking'}
            </p>
          ) : (
            <p className="text-muted-foreground">
              {EVENT_TYPE_LABELS[(booking as unknown as Record<string, string>).event_type] ||
                (booking as unknown as Record<string, string>).event_type}{' '}
              on{' '}
              {(booking as unknown as Record<string, string>).event_date
                ? new Date(
                    (booking as unknown as Record<string, string>).event_date
                  ).toLocaleDateString()
                : ''}
            </p>
          )}
        </div>
        <Badge className={`text-sm ${statusBadgeStyle(booking.status)}`}>
          {booking.status.replace(/_/g, ' ')}
        </Badge>
      </div>

      {/* Adjustment review — shown when couple needs to accept/decline */}
      {role === 'couple' && booking.status === 'adjusted_quote_sent' && (
        <AdjustmentReview
          bookingId={booking.id}
          originalSubtotalCents={originalSubtotal}
          adjustmentCents={adjustmentAmount}
          reason={adjustmentReason}
          explanation={adjustmentExplanation}
        />
      )}

      {/* Pending status banner for couple */}
      {role === 'couple' && booking.status === 'pending' && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          Waiting for vendor response. The vendor has 72 hours to accept or send an adjusted quote.
        </div>
      )}

      {/* Accepted status — pay deposit */}
      {role === 'couple' && booking.status === 'accepted' && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="font-medium text-emerald-800 mb-2">Quote accepted!</p>
          <p className="text-sm text-emerald-700 mb-3">
            Pay your deposit to confirm the booking. The vendor&apos;s full address and
            instructions will appear after payment.
          </p>
          {/* Couple can click deposit button from BookingActions below */}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Details Card */}
        <Card>
          <CardHeader>
            <CardTitle>{isPackageBooking ? 'Package Details' : 'Event Details'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isPackageBooking ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Package</span>
                  <span className="font-medium">
                    {(bookingAsAny.package_name_snapshot as string) ?? 'N/A'}
                  </span>
                </div>
                {packageBase > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Base price</span>
                    <span>${(packageBase / 100).toLocaleString()}</span>
                  </div>
                )}
                {selectedAddons.length > 0 && (
                  <div>
                    <p className="text-muted-foreground text-sm mb-1">Add-ons</p>
                    {selectedAddons.map(
                      (a: { name?: string; price_delta_cents: number }, i: number) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">+ {(a as { name: string }).name}</span>
                          <span>${(a.price_delta_cents / 100).toLocaleString()}</span>
                        </div>
                      )
                    )}
                  </div>
                )}
                {(bookingAsAny.total_price_cents as number) > 0 && (
                  <>
                    <Separator />
                    <div className="flex justify-between font-semibold">
                      <span>Total</span>
                      <span>
                        ${((bookingAsAny.total_price_cents as number) / 100).toLocaleString()}
                      </span>
                    </div>
                  </>
                )}
                {(bookingAsAny.guest_count as number) && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Guests</span>
                    <span>{bookingAsAny.guest_count as number}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date</span>
                  <span>
                    {new Date(
                      (booking as unknown as Record<string, string>).event_date
                    ).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Event Type</span>
                  <span>
                    {EVENT_TYPE_LABELS[
                      (booking as unknown as Record<string, string>).event_type
                    ] || (booking as unknown as Record<string, string>).event_type}
                  </span>
                </div>
                {(booking as unknown as Record<string, number | null>).guest_count && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Guests</span>
                    <span>{(booking as unknown as Record<string, number | null>).guest_count}</span>
                  </div>
                )}
                {((booking as unknown as Record<string, number | null>).budget_min ||
                  (booking as unknown as Record<string, number | null>).budget_max) && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Budget</span>
                    <span>
                      {(booking as unknown as Record<string, number | null>).budget_min &&
                        formatPrice(
                          (booking as unknown as Record<string, number | null>).budget_min!
                        )}
                      {(booking as unknown as Record<string, number | null>).budget_min &&
                        (booking as unknown as Record<string, number | null>).budget_max &&
                        ' – '}
                      {(booking as unknown as Record<string, number | null>).budget_max &&
                        formatPrice(
                          (booking as unknown as Record<string, number | null>).budget_max!
                        )}
                    </span>
                  </div>
                )}
              </>
            )}
            {(bookingAsAny.special_requests as string | null) && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">Special Requests</p>
                  <p className="mt-1 text-sm">{bookingAsAny.special_requests as string}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Events card (for package bookings) */}
        {isPackageBooking && bookingEvents && bookingEvents.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Events</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {bookingEvents.map((ev) => (
                <div key={ev.id} className="border rounded-lg p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">
                      Event {ev.sequence}: {ev.event_type_label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(ev.event_date).toLocaleDateString()}
                    </span>
                  </div>
                  {ev.location_name && (
                    <p className="text-xs text-muted-foreground">{ev.location_name}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {ev.address_line_1}, {ev.city}, {ev.state} {ev.postal_code}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Quote / Payment Card (for legacy flow) */}
        {!isPackageBooking && (
          <Card>
            <CardHeader>
              <CardTitle>
                {(booking as unknown as Record<string, number | null>).vendor_quote_amount
                  ? 'Quote'
                  : 'Awaiting Quote'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(booking as unknown as Record<string, number | null>).vendor_quote_amount ? (
                <>
                  <p className="text-3xl font-bold">
                    {formatPrice(
                      (booking as unknown as Record<string, number | null>).vendor_quote_amount!
                    )}
                  </p>
                  {(booking as unknown as Record<string, string | null>).vendor_quote_notes && (
                    <p className="text-sm text-muted-foreground">
                      {(booking as unknown as Record<string, string | null>).vendor_quote_notes}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">
                  {role === 'couple'
                    ? 'Waiting for the vendor to submit a quote...'
                    : 'Submit a quote for this booking request.'}
                </p>
              )}

              {role === 'vendor' && booking.status === 'pending' && (
                <>
                  <Separator />
                  <QuoteForm bookingId={booking.id} />
                </>
              )}

              {role === 'vendor' &&
                (booking as unknown as Record<string, boolean>).couple_contact_revealed && (
                  <div className="rounded-lg bg-green-50 p-4">
                    <p className="text-sm font-medium text-green-800">Contact Information</p>
                    {(booking as unknown as Record<string, string | null>).couple_phone && (
                      <p className="text-sm">
                        Phone:{' '}
                        {(booking as unknown as Record<string, string | null>).couple_phone}
                      </p>
                    )}
                    {(booking as unknown as Record<string, string | null>).couple_email && (
                      <p className="text-sm">
                        Email:{' '}
                        {(booking as unknown as Record<string, string | null>).couple_email}
                      </p>
                    )}
                  </div>
                )}

              <BookingActions
                booking={booking}
                role={role}
                hasReview={!!existingReview}
                vendorName={vendorProfile?.business_name ?? ''}
              />
            </CardContent>
          </Card>
        )}

        {/* Package booking actions card */}
        {isPackageBooking && (
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Vendor contact info after deposit paid */}
              {role === 'vendor' &&
                (booking as unknown as Record<string, boolean>).couple_contact_revealed && (
                  <div className="rounded-lg bg-green-50 p-4">
                    <p className="text-sm font-medium text-green-800">Contact Information</p>
                    {(bookingAsAny.couple_contact_phone as string | null) && (
                      <p className="text-sm">
                        Phone: {bookingAsAny.couple_contact_phone as string}
                      </p>
                    )}
                  </div>
                )}

              {/* Vendor notes (revealed after deposit paid) */}
              {booking.status === 'deposit_paid' && (bookingAsAny.vendor_notes as string | null) && (
                <div className="rounded-lg bg-muted p-4">
                  <p className="text-sm font-medium mb-1">Vendor Notes</p>
                  <p className="text-sm text-muted-foreground">
                    {bookingAsAny.vendor_notes as string}
                  </p>
                </div>
              )}

              <BookingActions
                booking={booking}
                role={role}
                hasReview={!!existingReview}
                vendorName={vendorProfile?.business_name ?? ''}
              />

              {role === 'couple' && vendorProfile && (
                <Button variant="outline" asChild className="w-full">
                  <Link href={`/vendors/${vendorProfile.slug}`}>View vendor profile</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
