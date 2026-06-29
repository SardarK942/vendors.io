'use client';
import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormErrors } from '@/hooks/useFormErrors';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  GooglePlacesAutocomplete,
  type PlaceData,
} from '@/components/forms/GooglePlacesAutocomplete';
import { locationSchema } from '@/lib/onboarding/validation';

interface Initial {
  baseAddressLine1: string;
  baseCity: string;
  baseState: string;
  basePostalCode: string;
  baseGooglePlaceId: string;
  baseAddressPublic: boolean;
  baseAddressSkipped: boolean;
}

interface Props {
  initial: Initial;
  profileId: string;
  mode: 'first' | 'next';
}

export function StepLocation({ initial, profileId, mode }: Props) {
  const router = useRouter();
  const baseAddressId = useId();
  const [place, setPlace] = useState<Partial<PlaceData>>({
    address_line_1: initial.baseAddressLine1,
    city: initial.baseCity,
    state: initial.baseState,
    postal_code: initial.basePostalCode,
    google_place_id: initial.baseGooglePlaceId,
  });
  const [addressPublic, setAddressPublic] = useState(initial.baseAddressPublic);
  const [skipAddress, setSkipAddress] = useState(initial.baseAddressSkipped);
  const { applyZodErrors, clearField, getError, total } = useFormErrors();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onNext() {
    const parsed = locationSchema.safeParse({
      baseAddressLine1: place.address_line_1 ?? '',
      baseCity: place.city ?? '',
      baseState: place.state ?? '',
      basePostalCode: place.postal_code ?? '',
      baseGooglePlaceId: place.google_place_id ?? '',
      baseAddressPublic: addressPublic,
      baseAddressSkipped: skipAddress,
    });
    if (!parsed.success) {
      applyZodErrors(parsed.error);
      return;
    }
    setSubmitting(true);
    const res = await fetch('/api/vendor-profile/setup/location', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...parsed.data, profile_id: profileId }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: 'Save failed' }));
      setServerError(json.error ?? 'Save failed');
      return;
    }
    const nextParam = mode === 'next' ? '?next=true' : '';
    router.push(`/dashboard/profile/setup/online${nextParam}`);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-balance text-2xl font-bold">Where are you based?</h1>
        <p className="text-sm text-muted-foreground">Step 2 of 6</p>
      </div>

      {total >= 2 && (
        <p className="text-sm font-medium text-hot-pink" role="status" aria-live="polite">
          {total} fields need attention
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor={baseAddressId}>Base address</Label>
        <GooglePlacesAutocomplete
          id={baseAddressId}
          value={place}
          onChange={(p) => {
            setPlace(p);
            clearField('baseAddressLine1');
            clearField('baseCity');
            clearField('baseState');
            clearField('basePostalCode');
            clearField('baseGooglePlaceId');
          }}
          placeholder={skipAddress ? 'Skipped' : 'Start typing your address…'}
          disabled={skipAddress}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        {place.city && (
          <p className="text-xs text-muted-foreground">
            {place.city}, {place.state} {place.postal_code}
          </p>
        )}
        {getError('baseAddressLine1') && (
          <p className="mt-1 text-xs text-hot-pink">{getError('baseAddressLine1')}</p>
        )}
        <label className="mt-2 flex items-center gap-2 text-sm text-ink/80">
          <input
            type="checkbox"
            checked={skipAddress}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
            onChange={(e) => {
              setSkipAddress(e.target.checked);
              if (e.target.checked) {
                setPlace({
                  address_line_1: '',
                  city: '',
                  state: '',
                  postal_code: '',
                  google_place_id: '',
                });
                clearField('baseAddressLine1');
                clearField('baseCity');
                clearField('baseState');
                clearField('basePostalCode');
                clearField('baseGooglePlaceId');
              }
            }}
          />
          I don’t have a fixed address (I travel to clients)
        </label>
        {!skipAddress && !place.address_line_1 && (
          <p className="mt-1 text-pretty text-xs text-ink/60">
            Adding an address helps customers find you in local searches.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Switch id="addressPublic" checked={addressPublic} onCheckedChange={setAddressPublic} />
          <Label htmlFor="addressPublic" className="cursor-pointer">
            Make my full address publicly visible
          </Label>
        </div>
        <p className="text-pretty pl-[calc(2.25rem+0.75rem)] text-xs text-muted-foreground">
          Customers see your city + state always. Full address shown only after they pay the
          deposit, unless you make it public here.
        </p>
      </div>

      {serverError && (
        <p className="text-sm text-destructive" role="alert" aria-live="assertive">
          {serverError}
        </p>
      )}

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={submitting}>
          {submitting ? 'Saving…' : 'Next'}
        </Button>
      </div>
    </div>
  );
}
