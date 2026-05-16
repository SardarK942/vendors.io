import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { getBookingById } from '@/services/booking.service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';
import { BookingActions } from '@/components/dashboard/BookingActions';
import { VendorBookingActions } from '@/components/booking/VendorBookingActions';
import { AdjustmentReview } from '@/components/booking/AdjustmentReview';
import Link from 'next/link';

interface BookingDetailPageProps {
  params: Promise<{ id: string }>;
}

function statusBadgeStyle(status: string) {
  if (status === 'deposit_paid' || status === 'completed') return 'bg-emerald-100 text-emerald-800';
  if (status === 'pending' || status === 'accepted') return 'bg-yellow-100 text-yellow-800';
  if (status === 'adjusted_quote_sent') return 'bg-blue-100 text-blue-800';
  if (status === 'adjusted_quote_declined') return 'bg-orange-100 text-orange-800';
  if (status === 'disputed') return 'bg-amber-100 text-amber-900';
  if (status.endsWith('cancelled') || status === 'expired') return 'bg-red-100 text-red-800';
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

  // Load booking events
  const { data: bookingEvents } = await supabase
    .from('booking_events')
    .select('*')
    .eq('booking_id', id)
    .order('sequence');

  // Compute subtotals for display
  const bookingAsAny = booking as unknown as Record<string, unknown>;
  const packageBase = (bookingAsAny.package_base_price_cents_snapshot as number) ?? 0;
  const selectedAddons = (bookingAsAny.selected_addons as { name: string; price_delta_cents: number }[]) ?? [];
  const addonsSum = selectedAddons.reduce((s: number, a) => s + (a.price_delta_cents ?? 0), 0);
  const originalSubtotal = packageBase + addonsSum;
  const adjustmentAmount = (bookingAsAny.adjustment_amount_cents as number) ?? 0;
  const adjustmentReason = (bookingAsAny.adjustment_reason as string) ?? '';
  const adjustmentExplanation = (bookingAsAny.adjustment_explanation as string | null) ?? null;

  // Per-event completion stats (available after migration 00027)
  const events = (bookingEvents ?? []) as Array<{
    id: string;
    sequence: number;
    event_type_label: string;
    event_date: string;
    location_name: string | null;
    address_line_1: string;
    city: string;
    state: string;
    postal_code: string;
    completed_at: string | null;
  }>;
  const totalEvents = events.length;
  const completedEvents = events.filter((e) => e.completed_at).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {role === 'couple' ? vendorProfile?.business_name : 'Booking Request'}
          </h1>
          <p className="text-muted-foreground">
            {(bookingAsAny.package_name_snapshot as string) ?? 'Package Booking'}
          </p>
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
          <p className="mb-2 font-medium text-emerald-800">Quote accepted!</p>
          <p className="mb-3 text-sm text-emerald-700">
            Pay your deposit to confirm the booking. The vendor&apos;s full address and instructions
            will appear after payment.
          </p>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Package Details Card */}
        <Card>
          <CardHeader>
            <CardTitle>Package Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
                <p className="mb-1 text-sm text-muted-foreground">Add-ons</p>
                {selectedAddons.map((a, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">+ {a.name}</span>
                    <span>${(a.price_delta_cents / 100).toLocaleString()}</span>
                  </div>
                ))}
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

        {/* Events Card with per-event completion display */}
        {events.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Events</CardTitle>
                {booking.status === 'deposit_paid' && totalEvents > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {completedEvents} of {totalEvents} complete
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {events.map((ev) => (
                <div key={ev.id} className="space-y-1 rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Event {ev.sequence}: {ev.event_type_label}
                    </span>
                    {ev.completed_at ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Completed {new Date(ev.completed_at).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {new Date(ev.event_date).toLocaleDateString()}
                      </span>
                    )}
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

        {/* Actions Card */}
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
            {booking.status === 'deposit_paid' &&
              (bookingAsAny.vendor_notes as string | null) && (
                <div className="rounded-lg bg-muted p-4">
                  <p className="mb-1 text-sm font-medium">Vendor Notes</p>
                  <p className="text-sm text-muted-foreground">
                    {bookingAsAny.vendor_notes as string}
                  </p>
                </div>
              )}

            {/* Vendor accept/adjust CTAs */}
            {role === 'vendor' &&
              (booking.status === 'pending' || booking.status === 'adjusted_quote_declined') && (
                <VendorBookingActions
                  bookingId={booking.id}
                  status={booking.status}
                  totalPriceCents={
                    ((booking as Record<string, unknown>).total_price_cents as number) ?? 0
                  }
                />
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
      </div>
    </div>
  );
}
