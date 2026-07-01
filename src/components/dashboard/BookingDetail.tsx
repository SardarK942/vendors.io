import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { getBookingById } from '@/services/booking.service';
import { wouldExceedCapacity } from '@/services/availability.service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';
import { BookingActions } from '@/components/dashboard/BookingActions';
import { VendorBookingActions } from '@/components/booking/VendorBookingActions';
import { AdjustmentReview } from '@/components/booking/AdjustmentReview';
import { ConflictWarning } from '@/components/dashboard/ConflictWarning';
import { VendorNotesEditor } from '@/components/dashboard/VendorNotesEditor';
import { getActiveVendorProfileId } from '@/lib/vendor/active';
import Link from 'next/link';
import { FirstBookingCelebration } from '@/components/celebration/FirstBookingCelebration';

function GuestCountSection({
  events,
}: {
  events: { event_type_label: string; guest_count_override: number | null }[];
}) {
  if (events.length === 1) {
    return (
      <div>
        <div className="text-xs uppercase text-ink/50">Guests</div>
        <div className="text-base text-ink">{events[0].guest_count_override ?? 0}</div>
      </div>
    );
  }
  return (
    <div>
      <div className="text-xs uppercase text-ink/50">Guests by event</div>
      <ul className="mt-2 space-y-1">
        {events.map((e, i) => (
          <li key={i} className="text-sm text-ink">
            <span className="font-medium">{e.event_type_label}</span>
            <span className="text-ink/60"> · {e.guest_count_override ?? 0} guests</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface BookingDetailProps {
  bookingId: string;
  mode: 'panel' | 'page';
  /** Value of ?action= query param. Passed down to client action components so they
   *  can auto-open the matching modal on first render, then strip the query. */
  initialAction?: string;
  /** When true (from ?welcome=true), show the first-booking celebration overlay. */
  showWelcome?: boolean;
}

function statusBadgeStyle(status: string) {
  if (status === 'deposit_paid' || status === 'completed') return 'bg-emerald-100 text-emerald-800';
  if (status === 'pending' || status === 'accepted' || status === 'pending_quote')
    return 'bg-yellow-100 text-yellow-800';
  if (status === 'adjusted_quote_sent') return 'bg-blue-100 text-blue-800';
  if (status === 'adjusted_quote_declined') return 'bg-orange-100 text-orange-800';
  if (status === 'disputed') return 'bg-amber-100 text-amber-900';
  if (status.endsWith('cancelled') || status === 'expired') return 'bg-red-100 text-red-800';
  return '';
}

export async function BookingDetail({
  bookingId,
  mode,
  initialAction,
  showWelcome,
}: BookingDetailProps) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  const role = (profile?.role as 'couple' | 'vendor') || 'couple';

  const result = await getBookingById(supabase, bookingId, user.id);
  if (result.error || !result.data) notFound();

  const booking = result.data;

  // Sub-project I §8: detect cross-business — booking belongs to a vendor_profile
  // different from the caller's active business.
  const activeBusinessId =
    role === 'vendor' ? await getActiveVendorProfileId(supabase, user.id) : null;
  const isCrossBusiness =
    role === 'vendor' &&
    activeBusinessId !== null &&
    booking.vendor_profile_id !== activeBusinessId;

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

  // Load booking events.
  // Couple reads from booking_events_public (excludes vendor_notes — Sub-project E §8).
  // Vendor reads raw booking_events (needs vendor_notes for the notes editor).
  const eventsTable = role === 'vendor' ? 'booking_events' : 'booking_events_public';
  const { data: bookingEvents } = await supabase
    .from(eventsTable as 'booking_events')
    .select('*')
    .eq('booking_id', bookingId)
    .order('sequence');

  // Compute subtotals for display
  const bookingAsAny = booking as unknown as Record<string, unknown>;
  const packageBase = (bookingAsAny.package_base_price_cents_snapshot as number) ?? 0;
  const selectedAddons =
    (bookingAsAny.selected_addons as { name: string; price_delta_cents: number }[]) ?? [];
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
    event_start_time: string;
    event_end_time: string;
    location_name: string | null;
    address_line_1: string;
    city: string;
    state: string;
    postal_code: string;
    completed_at: string | null;
    guest_count_override: number | null;
    vendor_notes?: string | null;
  }>;
  const totalEvents = events.length;
  const completedEvents = events.filter((e) => e.completed_at).length;

  // Conflict check — only needed for vendor viewing a pending booking
  let conflictOverlapCount = 0;
  let conflictCapacity = 0;
  if (role === 'vendor' && booking.status === 'pending' && events.length > 0) {
    try {
      const checks = await Promise.all(
        events.map((ev) =>
          wouldExceedCapacity(
            supabase,
            booking.vendor_profile_id,
            ev.event_date,
            ev.event_start_time,
            ev.event_end_time
          )
        )
      );
      const worst = checks.reduce(
        (acc, c) => (c.overlapping > acc.overlapping ? c : acc),
        checks[0]
      );
      if (worst.wouldExceed) {
        conflictOverlapCount = worst.overlapping;
        conflictCapacity = worst.capacity;
      }
    } catch {
      // Non-fatal — if the check fails, don't block the page from rendering
    }
  }
  const showConflictWarning = conflictOverlapCount > 0;

  // Derive first-booking overlay props from booking data
  const firstEventDate =
    events.length > 0
      ? new Date(events[0].event_date).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : '';
  const totalCents = (bookingAsAny.total_price_cents as number) ?? 0;
  const depositCents = Math.round(totalCents * 0.05);
  const responseSlaHours =
    (bookingAsAny.vendor_response_sla_hours as number | null | undefined) ?? 24;

  return (
    <div className="space-y-6">
      {/* First-booking celebration overlay — only rendered once via ?welcome=true */}
      {showWelcome && role === 'couple' && (
        <FirstBookingCelebration
          vendorName={vendorProfile?.business_name ?? 'Your vendor'}
          eventDate={firstEventDate}
          totalCents={totalCents}
          depositCents={depositCents}
          responseSlaHours={responseSlaHours}
        />
      )}
      {mode === 'page' && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {role === 'couple' ? vendorProfile?.business_name : 'Booking Request'}
            </h1>
            <p className="text-muted-foreground">
              {(bookingAsAny.package_name_snapshot as string) ?? 'Package Booking'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`text-sm ${statusBadgeStyle(booking.status)}`}>
              {booking.status.replace(/_/g, ' ')}
            </Badge>
            {/* Sub-project I §8: business-name chip when viewing a cross-business booking */}
            {isCrossBusiness && vendorProfile?.business_name && (
              <Badge variant="outline" className="text-xs">
                {vendorProfile.business_name}
              </Badge>
            )}
          </div>
        </div>
      )}

      {mode === 'panel' && (
        <div className="flex items-center gap-2">
          <Badge className={`text-sm ${statusBadgeStyle(booking.status)}`}>
            {booking.status.replace(/_/g, ' ')}
          </Badge>
          {/* Sub-project I §8: business-name chip when viewing a cross-business booking */}
          {isCrossBusiness && vendorProfile?.business_name && (
            <Badge variant="outline" className="text-xs">
              {vendorProfile.business_name}
            </Badge>
          )}
          <span className="text-sm text-muted-foreground">
            {role === 'couple' ? vendorProfile?.business_name : 'Booking Request'}
            {' · '}
            {(bookingAsAny.package_name_snapshot as string) ?? 'Package'}
          </span>
        </div>
      )}

      {/* Adjustment review — shown when couple needs to accept/decline */}
      {role === 'couple' && booking.status === 'adjusted_quote_sent' && (
        <AdjustmentReview
          bookingId={booking.id}
          originalSubtotalCents={originalSubtotal}
          adjustmentCents={adjustmentAmount}
          reason={adjustmentReason}
          explanation={adjustmentExplanation}
          totalPriceCents={(bookingAsAny.total_price_cents as number) ?? 0}
          coupleCounterCount={(bookingAsAny.couple_counter_count as number) ?? 0}
          initialAction={initialAction}
        />
      )}

      {/* Pending status banner for couple */}
      {role === 'couple' && booking.status === 'pending' && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          Waiting for vendor response. The vendor has 72 hours to accept or send an adjusted quote.
        </div>
      )}
      {role === 'couple' && booking.status === 'pending_quote' && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          Custom request sent to {vendorProfile?.business_name ?? 'the vendor'}. They’ll respond
          with a quote — we’ll email you and post it here.
        </div>
      )}

      {/* Accepted status — pay deposit */}
      {role === 'couple' && booking.status === 'accepted' && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="mb-2 font-medium text-emerald-800">Quote accepted!</p>
          <p className="mb-3 text-sm text-emerald-700">
            Pay your deposit to confirm the booking. The vendor’s full address and instructions will
            appear after payment.
          </p>
        </div>
      )}

      {/* Vendor-side status banners */}
      {role === 'vendor' && booking.status === 'pending' && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          <strong>Action needed:</strong> Accept this booking at the package price or send an
          adjusted quote. You have 72 hours.
        </div>
      )}
      {role === 'vendor' && booking.status === 'pending_quote' && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          <strong>Action needed:</strong> A couple sent a custom request. Read their notes below,
          then send them a quote to lock in the date.
        </div>
      )}
      {role === 'vendor' && booking.status === 'accepted' && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          Waiting for the customer to pay the deposit. They have 72 hours; you’ll get an email when
          they pay.
        </div>
      )}
      {role === 'vendor' && booking.status === 'adjusted_quote_sent' && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          Waiting for the customer to accept or decline your adjusted quote. They have 72 hours.
        </div>
      )}
      {role === 'vendor' && booking.status === 'adjusted_quote_declined' && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
          <strong>Action needed:</strong> The customer declined your last quote. You have 72 hours
          to send a revised quote — otherwise the booking will auto-cancel.
        </div>
      )}
      {role === 'vendor' && booking.status === 'couple_countered' && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          <strong>Action needed:</strong> The customer sent a counter-offer. You can adjust the
          quote or accept their counter directly. You have 72 hours.
        </div>
      )}
      {role === 'vendor' && booking.status === 'deposit_paid' && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <strong>Booking confirmed.</strong> Deposit paid. Deliver the service on the event
          date(s); funds release to your earnings 48h after the event completes.
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
            {events.length > 0 ? (
              <>
                <Separator />
                <GuestCountSection events={events} />
              </>
            ) : (bookingAsAny.guest_count as number) ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Guests</span>
                <span>{bookingAsAny.guest_count as number}</span>
              </div>
            ) : null}
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
                    <p className="text-sm">Phone: {bookingAsAny.couple_contact_phone as string}</p>
                  )}
                </div>
              )}

            {/* Bookings-level vendor_notes (instructions to couple after deposit paid).
                Different from booking_events.vendor_notes (private vendor notes — see below). */}
            {booking.status === 'deposit_paid' && (bookingAsAny.vendor_notes as string | null) && (
              <div className="rounded-lg bg-muted p-4">
                <p className="mb-1 text-sm font-medium">Vendor Notes</p>
                <p className="text-sm text-muted-foreground">
                  {bookingAsAny.vendor_notes as string}
                </p>
              </div>
            )}

            {/* Conflict warning — shown above Accept when vendor views a pending that would exceed capacity */}
            {role === 'vendor' && booking.status === 'pending' && showConflictWarning && (
              <ConflictWarning overlapCount={conflictOverlapCount} capacity={conflictCapacity} />
            )}

            {/* Vendor accept/adjust CTAs */}
            {role === 'vendor' &&
              (booking.status === 'pending' ||
                booking.status === 'pending_quote' ||
                booking.status === 'adjusted_quote_declined' ||
                booking.status === 'couple_countered') && (
                <VendorBookingActions
                  bookingId={booking.id}
                  status={booking.status}
                  totalPriceCents={
                    ((booking as Record<string, unknown>).total_price_cents as number) ?? 0
                  }
                  bookingBusinessId={booking.vendor_profile_id}
                  bookingBusinessName={vendorProfile?.business_name ?? undefined}
                  initialAction={initialAction}
                  vendorAdjustmentCount={
                    (booking as Record<string, unknown>).vendor_adjustment_count as number
                  }
                />
              )}

            <BookingActions
              booking={booking}
              role={role}
              hasReview={!!existingReview}
              vendorName={vendorProfile?.business_name ?? ''}
              initialAction={initialAction}
            />

            {role === 'couple' && vendorProfile && (
              <Button variant="outline" asChild className="w-full">
                <Link href={`/vendors/${vendorProfile.slug}`}>View vendor profile</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Private vendor notes editor — one textarea per booking_event. Vendor-only. */}
      {role === 'vendor' && events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Private notes — only you can see this</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {events.map((ev) => (
              <VendorNotesEditor
                key={ev.id}
                bookingEventId={ev.id}
                eventTypeLabel={ev.event_type_label}
                initialNotes={ev.vendor_notes ?? ''}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
