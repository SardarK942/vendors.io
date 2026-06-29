'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { EventRow, type EventRowData } from './EventRow';
import Image from 'next/image';
import { fmtUSD } from '@/lib/intl';

interface Addon {
  id: string;
  name: string;
  price_delta_cents: number;
}

interface PackageProps {
  id: string;
  name: string;
  description: string;
  base_price_cents: number;
  events_count: number;
  max_guests: number;
  duration_hours: number;
  featured_image_url: string;
  vendor_notes_template?: string | null;
  location_mode: 'couple_provides' | 'at_vendor';
  addons?: Addon[];
}

interface VendorProps {
  id: string;
  slug: string;
  business_name: string;
  base_city?: string | null;
  base_state?: string | null;
  base_address_line_1?: string | null;
  base_postal_code?: string | null;
  base_google_place_id?: string | null;
  base_address_public?: boolean | null;
}

interface SelectedAddon {
  addon_id: string;
  name: string;
  price_delta_cents: number;
}

interface Props {
  vendor: VendorProps;
  pkg: PackageProps;
  selectedAddons: SelectedAddon[];
}

function makeBlankEvent(seq: number): EventRowData {
  const today = new Date().toISOString().slice(0, 10);
  return {
    sequence: seq,
    event_date: today,
    // No trailing `Z`: keep these as local time-of-day defaults so the
    // <input type="datetime-local"> reads them without a TZ shift.
    event_start_time: `${today}T16:00:00`,
    event_end_time: `${today}T22:00:00`,
    event_type_label: '',
    location_name: null,
    address_line_1: '',
    city: '',
    state: '',
    postal_code: '',
    google_place_id: null,
    guest_count_override: null,
    location_overridden: false,
  };
}

export function BookingForm({ vendor, pkg, selectedAddons }: Props) {
  const router = useRouter();
  // Lazy init so makeBlankEvent's `new Date()` runs once at mount instead of
  // every render — avoids SSR/hydration date drift.
  const [events, setEvents] = useState<EventRowData[]>(() => [makeBlankEvent(1)]);
  const [coupleFullName, setCoupleFullName] = useState('');
  const [couplePhone, setCouplePhone] = useState('');
  // Bucket B T6: per-event guest counts keyed by event sequence (1-indexed)
  const [guestCounts, setGuestCounts] = useState<Record<number, number>>(() =>
    Object.fromEntries(Array.from({ length: pkg.events_count }, (_, i) => [i + 1, 50]))
  );
  const [specialRequests, setSpecialRequests] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fullNameId = useId();
  const phoneId = useId();
  const specialRequestsId = useId();

  const isSingleEvent = pkg.events_count === 1;

  // Live price computation
  const addonsTotal = selectedAddons.reduce((sum, a) => sum + a.price_delta_cents, 0);
  const estimatedTotal = pkg.base_price_cents + addonsTotal;

  function updateEvent(index: number, updates: Partial<EventRowData>) {
    setEvents((prev) => prev.map((e, i) => (i === index ? { ...e, ...updates } : e)));
  }

  function removeEvent(index: number) {
    setEvents((prev) => prev.filter((_, i) => i !== index));
  }

  function addEvent() {
    if (events.length >= pkg.events_count) return;
    setEvents((prev) => [...prev, makeBlankEvent(prev.length + 1)]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      // Bucket B T6: aggregate per-event counts for bookings.guest_count (sum).
      // Each event's guest_count_override is populated from the per-event input.
      const totalGuestCount = Object.values(guestCounts).reduce((sum, n) => sum + n, 0);
      const payload = {
        vendor_profile_id: vendor.id,
        package_id: pkg.id,
        selected_addons: selectedAddons,
        guest_count: totalGuestCount,
        special_requests: specialRequests || undefined,
        couple_full_name: coupleFullName,
        couple_contact_phone: couplePhone,
        events: events.map((ev, i) => ({
          ...ev,
          sequence: i + 1,
          // Per-event guest count stored in guest_count_override on booking_events.
          guest_count_override: isSingleEvent ? null : (guestCounts[i + 1] ?? 50),
        })),
      };

      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? 'Failed to submit booking. Please try again.');
        return;
      }

      const bookingId = json.data?.booking?.id as string | undefined;
      const isFirst = json.data?.is_first_booking === true;
      router.push(
        bookingId
          ? `/dashboard/bookings/${bookingId}${isFirst ? '?welcome=true' : ''}`
          : '/dashboard/bookings'
      );
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-8 md:grid-cols-3">
      <div className="space-y-8 md:col-span-2">
        {/* Section 1 — Package summary */}
        <Card>
          <CardHeader>
            <CardTitle>Selected Package</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-4">
              <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded">
                <Image
                  src={pkg.featured_image_url}
                  alt={pkg.name}
                  fill
                  className="object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
                />
              </div>
              <div>
                <p className="font-semibold" translate="no">
                  {pkg.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {pkg.duration_hours}
                  {' '}h · up to {pkg.max_guests} guests
                  {pkg.events_count > 1 && ` · ${pkg.events_count} events`}
                </p>
              </div>
            </div>
            <div className="space-y-1 text-sm tabular-nums">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Package base</span>
                <span>{fmtUSD(pkg.base_price_cents)}</span>
              </div>
              {selectedAddons.map((addon) => (
                <div key={addon.addon_id} className="flex justify-between">
                  <span className="text-muted-foreground">+ {addon.name}</span>
                  <span className={addon.price_delta_cents < 0 ? 'text-green-600' : ''}>
                    {addon.price_delta_cents >= 0 ? '+' : ''}
                    {fmtUSD(addon.price_delta_cents)}
                  </span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Subtotal</span>
                <span>{fmtUSD(estimatedTotal)}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              <a href={`/vendors/${vendor.slug}`} className="text-primary hover:underline">
                Edit selection
              </a>
            </p>
          </CardContent>
        </Card>

        {/* Section 2 — Events */}
        <Card>
          <CardHeader>
            <CardTitle>
              Events ({events.length}/{pkg.events_count})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {events.map((ev, i) => (
              <EventRow
                key={i}
                index={i}
                data={ev}
                onChange={updateEvent}
                onRemove={events.length > 1 ? removeEvent : undefined}
                locationMode={pkg.location_mode}
                vendor={vendor}
                vendorSlug={vendor.slug}
                event1Data={i > 0 ? events[0] : null}
              />
            ))}
            {events.length < pkg.events_count && (
              <Button type="button" variant="outline" onClick={addEvent}>
                + Add another event
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Section 3 — Couple details */}
        <Card>
          <CardHeader>
            <CardTitle>Your Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label htmlFor={fullNameId} className="mb-1 block text-sm font-medium">
                Full Name
              </label>
              <input
                id={fullNameId}
                type="text"
                required
                className="w-full rounded border p-2 text-sm"
                placeholder="e.g. Aisha & Ahmed Khan"
                value={coupleFullName}
                onChange={(e) => setCoupleFullName(e.target.value)}
                autoComplete="name"
              />
            </div>
            <div>
              <label htmlFor={phoneId} className="mb-1 block text-sm font-medium">
                Contact Phone
              </label>
              <input
                id={phoneId}
                type="tel"
                required
                className="w-full rounded border p-2 text-sm"
                placeholder="+1 (555) 000-0000"
                value={couplePhone}
                onChange={(e) => setCouplePhone(e.target.value)}
                autoComplete="tel"
                inputMode="tel"
              />
            </div>
            {/* Bucket B T6: per-event guest count inputs */}
            {isSingleEvent ? (
              <div>
                <label htmlFor="guest-count-1" className="mb-1 block text-sm font-medium">
                  How many guests?
                </label>
                <input
                  id="guest-count-1"
                  type="number"
                  required
                  min={1}
                  inputMode="numeric"
                  autoComplete="off"
                  className="w-full rounded border p-2 text-sm"
                  value={guestCounts[1]}
                  onChange={(e) =>
                    setGuestCounts({ ...guestCounts, 1: parseInt(e.target.value, 10) || 1 })
                  }
                />
              </div>
            ) : (
              Array.from({ length: pkg.events_count }, (_, i) => {
                const seq = i + 1;
                const inputId = `guest-count-${seq}`;
                return (
                  <div key={seq}>
                    <label htmlFor={inputId} className="mb-1 block text-sm font-medium">
                      Guests for Event {seq}
                    </label>
                    <input
                      id={inputId}
                      type="number"
                      required
                      min={1}
                      inputMode="numeric"
                      autoComplete="off"
                      className="w-full rounded border p-2 text-sm"
                      value={guestCounts[seq]}
                      onChange={(e) =>
                        setGuestCounts({
                          ...guestCounts,
                          [seq]: parseInt(e.target.value, 10) || 1,
                        })
                      }
                    />
                  </div>
                );
              })
            )}
            <div>
              <label htmlFor={specialRequestsId} className="mb-1 block text-sm font-medium">
                Special Requests (optional)
              </label>
              <textarea
                id={specialRequestsId}
                className="min-h-[80px] w-full rounded border p-2 text-sm"
                placeholder="Any special needs, dietary restrictions, setup requests…"
                value={specialRequests}
                onChange={(e) => setSpecialRequests(e.target.value)}
                autoComplete="off"
              />
            </div>
          </CardContent>
        </Card>

        {error && (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit Booking Request'}
        </Button>
      </div>

      {/* Section 4 — Sticky price panel */}
      <div className="h-fit md:sticky md:top-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Price Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm tabular-nums">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{pkg.name}</span>
              <span>{fmtUSD(pkg.base_price_cents)}</span>
            </div>
            {selectedAddons.map((addon) => (
              <div key={addon.addon_id} className="flex justify-between">
                <span className="text-muted-foreground">{addon.name}</span>
                <span className={addon.price_delta_cents < 0 ? 'text-green-600' : ''}>
                  {addon.price_delta_cents >= 0 ? '+' : ''}
                  {fmtUSD(addon.price_delta_cents)}
                </span>
              </div>
            ))}
            <Separator />
            <div className="flex justify-between text-base font-bold">
              <span>Estimated Total</span>
              <span>{fmtUSD(estimatedTotal)}</span>
            </div>
            <p className="pt-1 text-xs text-muted-foreground">
              Vendor may adjust the final price before deposit.
            </p>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

export default BookingForm;
