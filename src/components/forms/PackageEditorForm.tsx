'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { PackageAddonsEditor, type AddonDraft } from '@/components/forms/PackageAddonsEditor';
import { PackageLivePreview } from '@/components/forms/PackageLivePreview';
import { PhotoUploaderDrawer } from '@/components/ui/PhotoUploaderDrawer';
import { PACKAGE_CAPACITY_UNITS, type PackageCapacityUnitInput } from '@/types';
import { getPackageFieldConfig, type PricingUnit } from '@/lib/packages/archetypes';

// Human-readable labels for the pricing-unit selector. Kept here (UI layer)
// rather than in the archetype lib, which stays presentation-free.
const PRICING_UNIT_LABELS: Record<PricingUnit, string> = {
  flat: 'Flat rate',
  per_guest: 'Per guest',
  per_person: 'Per person',
  per_serving: 'Per serving',
  per_item: 'Per item',
  per_hour: 'Per hour',
  per_day: 'Per day',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PackageInitial {
  id: string;
  name: string;
  description: string;
  base_price_cents: number;
  // max_guests / duration_hours are archetype-gated and nullable as of
  // migration 00079 — categories that hide the field store NULL.
  max_guests: number | null;
  capacity_unit: PackageCapacityUnitInput;
  duration_hours: number | null;
  // Optional: pre-migration rows have no pricing_unit; the form falls back to
  // the category default when absent.
  pricing_unit?: PricingUnit;
  events_count: number;
  featured_image_url: string | null;
  gallery_image_urls: string[];
  included_items: string[];
  vendor_notes_template: string | null;
  location_mode: 'couple_provides' | 'at_vendor';
  is_featured: boolean;
  addons?: AddonDraft[];
}

interface Props {
  mode: 'create' | 'edit';
  initial?: PackageInitial;
  /**
   * The vendor's primary category. Drives field visibility, labels, and the
   * allowed pricing units via getPackageFieldConfig — including whether the
   * guests-vs-servings capacity-unit selector shows (cart vendors only).
   */
  category: string;
}

// ─── Section shell ──────────────────────────────────────────────────────────────

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 border-t border-hairline pt-6 first:border-t-0 first:pt-0">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
        {description && <p className="text-pretty text-xs text-ink-soft">{description}</p>}
      </div>
      {children}
    </section>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PackageEditorForm({ mode, initial, category }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Single source of truth for how this category's package fields behave.
  const cfg = getPackageFieldConfig(category);
  const capacityUnitEditable = cfg.capacityUnitEditable;

  // Controlled state — every field that feeds the live preview is controlled so
  // the customer-facing card mirror updates as the vendor types.
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [basePrice, setBasePrice] = useState(initial ? String(initial.base_price_cents / 100) : '');
  const [maxGuests, setMaxGuests] = useState(
    initial?.max_guests != null ? String(initial.max_guests) : ''
  );
  const [capacityUnit, setCapacityUnit] = useState<PackageCapacityUnitInput>(
    initial?.capacity_unit ?? 'guests'
  );
  const [durationHours, setDurationHours] = useState(
    initial?.duration_hours != null ? String(initial.duration_hours) : ''
  );
  const [pricingUnit, setPricingUnit] = useState<PricingUnit>(
    initial?.pricing_unit ?? cfg.defaultPricingUnit
  );
  const [eventsCount, setEventsCount] = useState(initial ? String(initial.events_count) : '1');
  const [featuredImageUrl, setFeaturedImageUrl] = useState(initial?.featured_image_url ?? '');
  const [locationMode, setLocationMode] = useState<'couple_provides' | 'at_vendor'>(
    initial?.location_mode ?? 'couple_provides'
  );
  // "Most popular" is set from the package-list card, not here — read-only in
  // the preview so the vendor still sees the badge if this package holds it.
  const isFeatured = initial?.is_featured ?? false;
  const [includedItems, setIncludedItems] = useState<string[]>(
    initial?.included_items?.length ? initial.included_items : ['']
  );
  const [notesTemplate, setNotesTemplate] = useState(initial?.vendor_notes_template ?? '');
  const [addons, setAddons] = useState<AddonDraft[]>(initial?.addons ?? []);

  const cleanIncluded = includedItems.map((s) => s.trim()).filter(Boolean);

  function updateIncluded(i: number, value: string) {
    setIncludedItems((prev) => prev.map((s, j) => (j === i ? value : s)));
  }
  function removeIncluded(i: number) {
    setIncludedItems((prev) => (prev.length === 1 ? [''] : prev.filter((_, j) => j !== i)));
  }
  function addIncluded() {
    setIncludedItems((prev) => [...prev, '']);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const payload = {
      name: name.trim(),
      description: description.trim(),
      base_price_cents: Math.round(parseFloat(basePrice) * 100),
      // Archetype-gated: hidden fields submit null (never 0/1); a visible-but-
      // empty optional field also submits null.
      max_guests:
        cfg.maxGuests === 'hidden' || maxGuests.trim() === '' ? null : parseInt(maxGuests, 10),
      // Non-cart vendors never see the unit selector; pin them to 'guests'.
      // is_featured is intentionally omitted — it's owned by the list toggle.
      capacity_unit: capacityUnitEditable ? capacityUnit : ('guests' as const),
      duration_hours:
        cfg.durationHours === 'hidden' || durationHours.trim() === ''
          ? null
          : parseFloat(durationHours),
      // Phase 1: stored/display only — no pricing-math change. When the category
      // allows a single unit there's no control, so this stays the default.
      pricing_unit: pricingUnit,
      events_count: parseInt(eventsCount || '1', 10),
      featured_image_url: featuredImageUrl || null,
      gallery_image_urls: [] as string[],
      included_items: cleanIncluded,
      vendor_notes_template: notesTemplate.trim() || null,
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
    <form onSubmit={handleSubmit}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── Form column ─────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-8">
          {/* Basics */}
          <Section title="Basics" description="What couples see first.">
            <div className="space-y-2">
              <Label htmlFor="name">Package name *</Label>
              <Input
                id="name"
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Premium Open Bar"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                required
                maxLength={2000}
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What’s included, your style, what makes this package special…"
                autoComplete="off"
              />
            </div>

            {/* Featured image — the single biggest conversion driver, so it lives
                up top rather than buried mid-form. */}
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Featured image</legend>
              <p className="text-xs text-ink-soft">
                Optional — packages without a photo show a placeholder tile. Adding one boosts
                bookings.
              </p>
              <PhotoUploaderDrawer
                value={featuredImageUrl ? [featuredImageUrl] : []}
                onChange={(urls) => setFeaturedImageUrl(urls[0] ?? '')}
                endpoint="packageFeatureImage"
                maxFiles={1}
                maxSizeMb={16}
                triggerLabel={{ empty: 'Upload feature image', manage: 'Change feature image' }}
              />
            </fieldset>
          </Section>

          {/* Pricing & capacity */}
          <Section
            title="Pricing & capacity"
            description="Set a starting price and how you measure capacity — guests, servings, tables, and more."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="base_price">Base price ($) *</Label>
                <Input
                  id="base_price"
                  type="number"
                  min={1}
                  step={0.01}
                  required
                  value={basePrice}
                  onChange={(e) => setBasePrice(e.target.value)}
                  placeholder="1500"
                  inputMode="decimal"
                  autoComplete="off"
                  className="tabular-nums"
                />
                <p className="text-pretty text-xs text-ink-soft">
                  Not final — you can send an adjusted quote per booking.
                </p>
              </div>
              {cfg.maxGuests !== 'hidden' && (
                <div className="space-y-2">
                  <Label htmlFor="max_guests">
                    {cfg.maxGuestsLabel}
                    {cfg.maxGuests === 'required' ? ' *' : ''}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="max_guests"
                      type="number"
                      min={1}
                      required={cfg.maxGuests === 'required'}
                      value={maxGuests}
                      onChange={(e) => setMaxGuests(e.target.value)}
                      placeholder="200"
                      inputMode="numeric"
                      autoComplete="off"
                      className="tabular-nums"
                    />
                    {capacityUnitEditable && (
                      <Select
                        value={capacityUnit}
                        onValueChange={(v) => setCapacityUnit(v as PackageCapacityUnitInput)}
                      >
                        <SelectTrigger className="w-[130px] shrink-0" aria-label="Capacity unit">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PACKAGE_CAPACITY_UNITS.map((u) => (
                            <SelectItem key={u.value} value={u.value}>
                              {u.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  {capacityUnitEditable && (
                    <p className="text-pretty text-xs text-ink-soft">
                      Shows as “{maxGuests ? `up to ${maxGuests}` : 'up to 200'} {capacityUnit}”.
                      Choose servings if you price by the pour.
                    </p>
                  )}
                </div>
              )}
            </div>

            {cfg.pricingUnits.length > 1 && (
              <div className="space-y-2 sm:max-w-[calc(50%-0.5rem)]">
                <Label htmlFor="pricing_unit">How you price</Label>
                <Select value={pricingUnit} onValueChange={(v) => setPricingUnit(v as PricingUnit)}>
                  <SelectTrigger id="pricing_unit" aria-label="Pricing unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cfg.pricingUnits.map((u) => (
                      <SelectItem key={u} value={u}>
                        {PRICING_UNIT_LABELS[u]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-pretty text-xs text-ink-soft">
                  How your base price is measured — shown to couples for context.
                </p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {cfg.durationHours !== 'hidden' && (
                <div className="space-y-2">
                  <Label htmlFor="duration_hours">
                    {cfg.durationHoursLabel}
                    {cfg.durationHours === 'required' ? ' *' : ''}
                  </Label>
                  <Input
                    id="duration_hours"
                    type="number"
                    min={0.5}
                    step={0.5}
                    required={cfg.durationHours === 'required'}
                    value={durationHours}
                    onChange={(e) => setDurationHours(e.target.value)}
                    placeholder="8"
                    inputMode="decimal"
                    autoComplete="off"
                    className="tabular-nums"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="events_count">Number of events (1–5)</Label>
                <Input
                  id="events_count"
                  type="number"
                  min={1}
                  max={5}
                  value={eventsCount}
                  onChange={(e) => setEventsCount(e.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                  className="tabular-nums"
                />
                <p className="text-pretty text-xs text-ink-soft">
                  Set to 3 for a Mehndi + Shaadi + Walima bundle.
                </p>
              </div>
            </div>
          </Section>

          {/* What's included */}
          <Section
            title="What’s included"
            description="One line per item — couples scan these to compare packages."
          >
            <div className="space-y-2">
              {includedItems.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={item}
                    onChange={(e) => updateIncluded(i, e.target.value)}
                    placeholder="e.g. 2 bartenders for 5 hours"
                    maxLength={200}
                    autoComplete="off"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    iconLeading={<X className="size-4" aria-hidden="true" />}
                    onClick={() => removeIncluded(i)}
                    aria-label="Remove item"
                  />
                </div>
              ))}
              {includedItems.length < 20 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  iconLeading={<Plus className="size-4" aria-hidden="true" />}
                  onClick={addIncluded}
                >
                  Add item
                </Button>
              )}
            </div>
          </Section>

          {/* Add-ons */}
          <Section
            title="Add-ons"
            description="Optional extras couples can toggle. Use a negative price for a discount."
          >
            <PackageAddonsEditor initial={addons} onChange={setAddons} max={8} />
          </Section>

          {/* Logistics */}
          <Section title="Logistics" description="Where the service happens and what to expect.">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Location</legend>
              <div className="flex flex-wrap gap-4">
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

            <div className="space-y-2">
              <Label htmlFor="vendor_notes_template">Notes template (optional, ≤1000 chars)</Label>
              <Textarea
                id="vendor_notes_template"
                rows={3}
                maxLength={1000}
                value={notesTemplate}
                onChange={(e) => setNotesTemplate(e.target.value)}
                placeholder="I’ll arrive 30 min early to set up. Please have…"
              />
              <p className="text-pretty text-xs text-ink-soft">
                Sent to customers automatically when you accept a booking.
              </p>
            </div>
          </Section>

          <div className="flex gap-3 border-t border-hairline pt-6">
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving…' : mode === 'create' ? 'Create package' : 'Update package'}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </div>

        {/* ── Live preview rail ───────────────────────────────────────── */}
        <aside className="order-first lg:order-none">
          <div className="lg:sticky lg:top-6">
            <PackageLivePreview
              data={{
                name,
                basePriceCents: basePrice ? Math.round(parseFloat(basePrice) * 100) : null,
                maxGuests: maxGuests ? parseInt(maxGuests, 10) : null,
                capacityUnit,
                durationHours: durationHours ? parseFloat(durationHours) : null,
                eventsCount: parseInt(eventsCount || '1', 10),
                featuredImageUrl,
                isFeatured,
                includedCount: cleanIncluded.length,
                addonCount: addons.filter((a) => a.name.trim()).length,
              }}
            />
          </div>
        </aside>
      </div>
    </form>
  );
}
