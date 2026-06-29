'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PackageAddonsEditor, type AddonDraft } from '@/components/forms/PackageAddonsEditor';
import { PhotoUploaderDrawer } from '@/components/ui/PhotoUploaderDrawer';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PackageInitial {
  id: string;
  name: string;
  description: string;
  base_price_cents: number;
  max_guests: number;
  duration_hours: number;
  events_count: number;
  featured_image_url: string;
  gallery_image_urls: string[];
  included_items: string[];
  vendor_notes_template: string | null;
  location_mode: 'couple_provides' | 'at_vendor';
  addons?: AddonDraft[];
}

interface Props {
  mode: 'create' | 'edit';
  initial?: PackageInitial;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PackageEditorForm({ mode, initial }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [addons, setAddons] = useState<AddonDraft[]>(initial?.addons ?? []);
  const [includedItemsText, setIncludedItemsText] = useState(
    (initial?.included_items ?? []).join('\n')
  );
  const [featuredImageUrl, setFeaturedImageUrl] = useState(initial?.featured_image_url ?? '');
  const [locationMode, setLocationMode] = useState<'couple_provides' | 'at_vendor'>(
    initial?.location_mode ?? 'couple_provides'
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const form = new FormData(e.currentTarget);

    const includedItems = includedItemsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    if (!featuredImageUrl) {
      toast.error('Featured image is required — upload or paste a URL.');
      setLoading(false);
      return;
    }

    const payload = {
      name: form.get('name') as string,
      description: form.get('description') as string,
      base_price_cents: Math.round(parseFloat(form.get('base_price') as string) * 100),
      max_guests: parseInt(form.get('max_guests') as string, 10),
      duration_hours: parseFloat(form.get('duration_hours') as string),
      events_count: parseInt(form.get('events_count') as string, 10),
      featured_image_url: featuredImageUrl,
      gallery_image_urls: [] as string[],
      included_items: includedItems,
      vendor_notes_template: (form.get('vendor_notes_template') as string) || null,
      location_mode: locationMode,
      addons,
    };

    const url = mode === 'create' ? '/api/packages' : `/api/packages/${initial!.id}`;
    const method = mode === 'create' ? 'POST' : 'PATCH';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        // Error boundary returns { error: "message" } for HttpError/ZodError/generic.
        // The legacy Supabase path returns { error: { message: "..." } }. Handle both.
        const headline =
          typeof json.error === 'string'
            ? json.error
            : (json.error?.message ?? 'Failed to save package');
        // ZodError surfaces field-level details under json.details.fieldErrors.
        const fieldErrors = json.details?.fieldErrors as Record<string, string[]> | undefined;
        const fieldList = fieldErrors
          ? Object.entries(fieldErrors)
              .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
              .join(' · ')
          : '';
        toast.error(fieldList ? `${headline} — ${fieldList}` : headline);
        return;
      }

      toast.success(mode === 'create' ? 'Package created' : 'Package updated');
      router.push('/dashboard/profile/packages');
      router.refresh();
    } catch {
      toast.error('Network error, please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === 'create' ? 'New Package' : 'Edit Package'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Package Name *</Label>
            <Input
              id="name"
              name="name"
              required
              maxLength={120}
              defaultValue={initial?.name}
              placeholder="e.g. Full-Day Wedding Coverage"
              autoComplete="off"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              name="description"
              required
              maxLength={2000}
              rows={4}
              defaultValue={initial?.description}
              placeholder="What’s included, your style, what makes this package special…"
              autoComplete="off"
            />
          </div>

          {/* Base Price + Max Guests */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="base_price">Base Price ($) *</Label>
              <Input
                id="base_price"
                name="base_price"
                type="number"
                min={1}
                step={0.01}
                required
                defaultValue={initial ? initial.base_price_cents / 100 : ''}
                placeholder="1500"
                inputMode="decimal"
                autoComplete="off"
                className="tabular-nums"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_guests">Max Guests *</Label>
              <Input
                id="max_guests"
                name="max_guests"
                type="number"
                min={1}
                required
                defaultValue={initial?.max_guests}
                placeholder="200"
                inputMode="numeric"
                autoComplete="off"
                className="tabular-nums"
              />
            </div>
          </div>

          {/* Duration + Events Count */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="duration_hours">Duration (hours) *</Label>
              <Input
                id="duration_hours"
                name="duration_hours"
                type="number"
                min={0.5}
                step={0.5}
                required
                defaultValue={initial?.duration_hours}
                placeholder="8"
                inputMode="decimal"
                autoComplete="off"
                className="tabular-nums"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="events_count">Number of Events (1–5)</Label>
              <Input
                id="events_count"
                name="events_count"
                type="number"
                min={1}
                max={5}
                defaultValue={initial?.events_count ?? 1}
                inputMode="numeric"
                autoComplete="off"
                className="tabular-nums"
              />
              <p className="text-pretty text-xs text-muted-foreground">
                Set to 3 for a Mehndi + Shaadi + Walima bundle
              </p>
            </div>
          </div>

          {/* Featured Image */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Featured Image *</legend>
            <PhotoUploaderDrawer
              value={featuredImageUrl ? [featuredImageUrl] : []}
              onChange={(urls) => setFeaturedImageUrl(urls[0] ?? '')}
              endpoint="packageFeatureImage"
              maxFiles={1}
              maxSizeMb={4}
              triggerLabel={{ empty: 'Upload feature image', manage: 'Change feature image' }}
            />
          </fieldset>

          {/* Location Mode */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Location</legend>
            <div className="flex gap-4">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="location_mode_radio"
                  value="couple_provides"
                  checked={locationMode === 'couple_provides'}
                  onChange={() => setLocationMode('couple_provides')}
                />
                <span className="text-sm">Customer specifies location</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="location_mode_radio"
                  value="at_vendor"
                  checked={locationMode === 'at_vendor'}
                  onChange={() => setLocationMode('at_vendor')}
                />
                <span className="text-sm">At my location</span>
              </label>
            </div>
          </fieldset>

          {/* Included Items */}
          <div className="space-y-2">
            <Label htmlFor="included_items">Included Items</Label>
            <Textarea
              id="included_items"
              rows={4}
              value={includedItemsText}
              onChange={(e) => setIncludedItemsText(e.target.value)}
              placeholder={'8 hours coverage\n200+ edited photos\nOnline gallery'}
            />
            <p className="text-xs text-muted-foreground">One item per line</p>
          </div>

          {/* Vendor Notes Template */}
          <div className="space-y-2">
            <Label htmlFor="vendor_notes_template">Notes Template (optional, ≤1000 chars)</Label>
            <Textarea
              id="vendor_notes_template"
              name="vendor_notes_template"
              rows={3}
              maxLength={1000}
              defaultValue={initial?.vendor_notes_template ?? ''}
              placeholder="I’ll arrive 30 min early to set up. Please have…"
            />
            <p className="text-pretty text-xs text-muted-foreground">
              Sent to customers automatically when you accept a booking.
            </p>
          </div>

          {/* Add-ons */}
          <PackageAddonsEditor initial={addons} onChange={setAddons} max={8} />

          <div className="flex gap-3">
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving…' : mode === 'create' ? 'Create Package' : 'Update Package'}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
