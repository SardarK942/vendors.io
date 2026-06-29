'use client';

import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { EventTypeAutocomplete } from './EventTypeAutocomplete';
import { GooglePlacesAutocomplete } from './GooglePlacesAutocomplete';
import type { PlaceData } from './GooglePlacesAutocomplete';
import { AvailabilityCalendar } from '@/components/marketplace/AvailabilityCalendar';

export interface EventRowData {
  sequence: number;
  event_date: string;
  event_start_time: string;
  event_end_time: string;
  event_type_label: string;
  location_name?: string | null;
  address_line_1: string;
  city: string;
  state: string;
  postal_code: string;
  google_place_id?: string | null;
  guest_count_override?: number | null;
  location_overridden: boolean;
}

interface VendorBaseAddress {
  base_address_line_1?: string | null;
  base_city?: string | null;
  base_state?: string | null;
  base_postal_code?: string | null;
  base_google_place_id?: string | null;
  business_name?: string | null;
}

interface Props {
  index: number;
  data: EventRowData;
  onChange: (index: number, updates: Partial<EventRowData>) => void;
  onRemove?: (index: number) => void;
  locationMode: 'couple_provides' | 'at_vendor';
  vendor?: VendorBaseAddress;
  vendorSlug?: string;
  event1Data?: EventRowData | null; // For "Same as Event 1" button
}

export function EventRow({
  index,
  data,
  onChange,
  onRemove,
  locationMode,
  vendor,
  vendorSlug,
  event1Data,
}: Props) {
  const isAtVendor = locationMode === 'at_vendor' && !data.location_overridden;
  const eventTypeId = useId();
  const dateId = useId();
  const startTimeId = useId();
  const endTimeId = useId();
  const locationId = useId();
  const venueNameId = useId();

  function handlePlaceChange(place: PlaceData) {
    onChange(index, {
      address_line_1: place.address_line_1,
      city: place.city,
      state: place.state,
      postal_code: place.postal_code,
      google_place_id: place.google_place_id,
      location_name: place.location_name ?? null,
      location_overridden: true,
    });
  }

  function copyFromEvent1() {
    if (!event1Data) return;
    onChange(index, {
      address_line_1: event1Data.address_line_1,
      city: event1Data.city,
      state: event1Data.state,
      postal_code: event1Data.postal_code,
      google_place_id: event1Data.google_place_id,
      location_name: event1Data.location_name,
      location_overridden: event1Data.location_overridden,
    });
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Event {index + 1}</h4>
        {onRemove && index > 0 && (
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="relative px-2 py-1 text-xs text-destructive before:absolute before:-inset-1.5 before:content-[''] hover:underline"
          >
            Remove
          </button>
        )}
      </div>

      {/* Event Type */}
      <div>
        <label htmlFor={eventTypeId} className="mb-1 block text-xs text-muted-foreground">
          Event Type
        </label>
        <EventTypeAutocomplete
          inputId={eventTypeId}
          value={data.event_type_label}
          onChange={(v) => onChange(index, { event_type_label: v })}
        />
      </div>

      {/* Date */}
      <div>
        <label htmlFor={dateId} className="mb-1 block text-xs text-muted-foreground">
          Date
        </label>
        {vendorSlug ? (
          <AvailabilityCalendar
            vendorSlug={vendorSlug}
            selected={data.event_date || undefined}
            onSelect={(iso) => {
              onChange(index, { event_date: iso });
            }}
          />
        ) : (
          <input
            id={dateId}
            type="date"
            className="w-full rounded-md border p-2 text-sm"
            value={data.event_date}
            onChange={(e) => onChange(index, { event_date: e.target.value })}
            required
          />
        )}
      </div>

      {/* Time range */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={startTimeId} className="mb-1 block text-xs text-muted-foreground">
            Start Time
          </label>
          <input
            id={startTimeId}
            type="time"
            className="w-full rounded-md border p-2 text-sm"
            value={data.event_start_time.slice(11, 16)}
            onChange={(e) => {
              const [h, m] = e.target.value.split(':');
              const base = data.event_date || new Date().toISOString().slice(0, 10);
              // No trailing `Z` — keep the time as the user typed it, in local TZ.
              onChange(index, { event_start_time: `${base}T${h}:${m}:00` });
            }}
            required
          />
        </div>
        <div>
          <label htmlFor={endTimeId} className="mb-1 block text-xs text-muted-foreground">
            End Time
          </label>
          <input
            id={endTimeId}
            type="time"
            className="w-full rounded-md border p-2 text-sm"
            value={data.event_end_time.slice(11, 16)}
            onChange={(e) => {
              const [h, m] = e.target.value.split(':');
              const base = data.event_date || new Date().toISOString().slice(0, 10);
              // No trailing `Z` — keep the time as the user typed it, in local TZ.
              onChange(index, { event_end_time: `${base}T${h}:${m}:00` });
            }}
            required
          />
        </div>
      </div>

      {/* Location */}
      <div>
        <label htmlFor={locationId} className="mb-1 block text-xs text-muted-foreground">
          Location
        </label>

        {isAtVendor ? (
          <div className="space-y-1 rounded-md border bg-muted/50 p-2 text-sm">
            <p className="text-muted-foreground">
              Service at {vendor?.business_name ? `${vendor.business_name} — ` : ''}
              {vendor?.base_city}, {vendor?.base_state}
            </p>
            <button
              type="button"
              onClick={() => onChange(index, { location_overridden: true })}
              className="text-xs text-primary hover:underline"
            >
              Different location for this event
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {index > 0 && event1Data && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copyFromEvent1}
                className="text-xs"
              >
                Same as Event 1
              </Button>
            )}
            <GooglePlacesAutocomplete
              id={locationId}
              value={{
                address_line_1: data.address_line_1,
                city: data.city,
                state: data.state,
                postal_code: data.postal_code,
              }}
              onChange={handlePlaceChange}
              placeholder="Where will this event take place?"
            />
            {data.address_line_1 && (
              <p className="text-xs text-muted-foreground">
                {data.address_line_1}, {data.city}, {data.state} {data.postal_code}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Optional location name */}
      {!isAtVendor && (
        <div>
          <label htmlFor={venueNameId} className="mb-1 block text-xs text-muted-foreground">
            Venue Name (optional)
          </label>
          <input
            id={venueNameId}
            type="text"
            className="w-full rounded-md border p-2 text-sm"
            placeholder="e.g. The Drake Hotel"
            value={data.location_name ?? ''}
            onChange={(e) => onChange(index, { location_name: e.target.value || null })}
          />
        </div>
      )}

      {/* Bucket B T6: guest_count_override is now set by BookingForm, not an end-user override */}
    </div>
  );
}

export default EventRow;
