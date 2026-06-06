'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
}

interface Props {
  initial: Initial;
  profileId: string;
  mode: 'first' | 'next';
}

export function StepLocation({ initial, profileId, mode }: Props) {
  const router = useRouter();
  const [place, setPlace] = useState<Partial<PlaceData>>({
    address_line_1: initial.baseAddressLine1,
    city: initial.baseCity,
    state: initial.baseState,
    postal_code: initial.basePostalCode,
    google_place_id: initial.baseGooglePlaceId,
  });
  const [addressPublic, setAddressPublic] = useState(initial.baseAddressPublic);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onNext() {
    const parsed = locationSchema.safeParse({
      baseAddressLine1: place.address_line_1 ?? '',
      baseCity: place.city ?? '',
      baseState: place.state ?? '',
      basePostalCode: place.postal_code ?? '',
      baseGooglePlaceId: place.google_place_id ?? '',
      baseAddressPublic: addressPublic,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
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
      setError(json.error ?? 'Save failed');
      return;
    }
    const nextParam = mode === 'next' ? '?next=true' : '';
    router.push(`/dashboard/profile/setup/online${nextParam}`);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Where are you based?</h1>
        <p className="text-sm text-muted-foreground">Step 2 of 7</p>
      </div>

      <div className="space-y-2">
        <Label>Base address</Label>
        <GooglePlacesAutocomplete
          value={place}
          onChange={(p) => setPlace(p)}
          placeholder="Start typing your address..."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {place.city && (
          <p className="text-xs text-muted-foreground">
            {place.city}, {place.state} {place.postal_code}
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
        <p className="pl-[calc(2.25rem+0.75rem)] text-xs text-muted-foreground">
          Couples see your city + state always. Full address shown only after they pay the deposit,
          unless you make it public here.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={submitting}>
          {submitting ? 'Saving…' : 'Next'}
        </Button>
      </div>
    </div>
  );
}
