'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PhotoUploaderDrawer } from '@/components/ui/PhotoUploaderDrawer';
import { StreamVideoUploader } from '@/components/ui/StreamVideoUploader';
import { ProductVariantsEditor, type VariantDraft } from '@/components/forms/ProductVariantsEditor';
import { GARMENT_TYPES, GARMENT_TYPE_LABELS } from '@/lib/products/garment-types';
import type { GarmentType, ProductStatus } from '@/types/database.types';
import type { CreateProductInput } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

// The subset of a product row (plus variants) the editor needs to hydrate an
// edit. Kept structural so the edit page can pass a ProductWithVariants directly.
export interface ProductInitial {
  id: string;
  title: string;
  description: string;
  garment_type: GarmentType;
  base_price_cents: number;
  currency: string;
  images: string[];
  video_uids: string[];
  attributes: Record<string, unknown> | null;
  ships_internationally: boolean;
  tailoring_available: boolean;
  lead_time_days: number | null;
  status: ProductStatus;
  variants: VariantDraft[];
}

interface Props {
  mode: 'create' | 'edit';
  initial?: ProductInitial;
}

// Free-form attribute fields written into the products.attributes JSONB bag.
// Prototype scope: three text descriptors couples care about most.
const ATTRIBUTE_FIELDS = [
  { key: 'color', label: 'Color', placeholder: 'e.g. Deep maroon' },
  { key: 'fabric', label: 'Fabric', placeholder: 'e.g. Raw silk' },
  { key: 'work', label: 'Work / embellishment', placeholder: 'e.g. Zardozi hand-embroidery' },
] as const;

const CURRENCIES = ['usd', 'gbp', 'inr', 'cad'] as const;

const STATUS_LABELS: Record<ProductStatus, string> = {
  draft: 'Draft (hidden)',
  active: 'Active (live)',
  out_of_stock: 'Out of stock',
  archived: 'Archived',
};

// ─── Section shell (mirrors PackageEditorForm) ──────────────────────────────────

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

export function ProductEditorForm({ mode, initial }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [garmentType, setGarmentType] = useState<GarmentType>(initial?.garment_type ?? 'lehenga');
  const [basePrice, setBasePrice] = useState(initial ? String(initial.base_price_cents / 100) : '');
  const [currency, setCurrency] = useState<string>(initial?.currency ?? 'usd');
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [videoUids, setVideoUids] = useState<string[]>(initial?.video_uids ?? []);
  const [shipsInternationally, setShipsInternationally] = useState(
    initial?.ships_internationally ?? false
  );
  const [tailoringAvailable, setTailoringAvailable] = useState(
    initial?.tailoring_available ?? false
  );
  const [leadTimeDays, setLeadTimeDays] = useState(
    initial?.lead_time_days != null ? String(initial.lead_time_days) : ''
  );
  const [status, setStatus] = useState<ProductStatus>(initial?.status ?? 'draft');
  const [variants, setVariants] = useState<VariantDraft[]>(initial?.variants ?? []);

  const [attributeValues, setAttributeValues] = useState<Record<string, string>>(() => {
    const stored = (initial?.attributes ?? {}) as Record<string, unknown>;
    const seed: Record<string, string> = {};
    for (const field of ATTRIBUTE_FIELDS) {
      const value = stored[field.key];
      if (value != null) seed[field.key] = String(value);
    }
    return seed;
  });

  function setAttribute(key: string, value: string) {
    setAttributeValues((prev) => ({ ...prev, [key]: value }));
  }

  // Only non-empty descriptors survive into the stored JSONB bag.
  function buildCleanAttributes(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const field of ATTRIBUTE_FIELDS) {
      const value = (attributeValues[field.key] ?? '').trim();
      if (value !== '') out[field.key] = value;
    }
    return out;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    // Payload matches createProductSchema / updateProductSchema. Variants keep
    // their cents value; empty size rows are dropped so a stray blank row can't
    // fail Zod's size_label min(1).
    const cleanVariants = variants
      .filter((v) => v.size_label.trim() !== '')
      .map((v) => ({
        size_label: v.size_label.trim(),
        sku: v.sku.trim() === '' ? null : v.sku.trim(),
        price_delta_cents: v.price_delta_cents,
        stock_quantity: v.stock_quantity,
      }));

    const payload: CreateProductInput = {
      title: title.trim(),
      description: description.trim(),
      garment_type: garmentType,
      base_price_cents: Math.round(parseFloat(basePrice || '0') * 100),
      currency,
      images,
      video_uids: videoUids,
      attributes: buildCleanAttributes(),
      ships_internationally: shipsInternationally,
      tailoring_available: tailoringAvailable,
      lead_time_days: leadTimeDays.trim() === '' ? null : parseInt(leadTimeDays, 10),
      status,
      variants: cleanVariants,
    };

    const url = mode === 'create' ? '/api/products' : `/api/products/${initial!.id}`;
    const method = mode === 'create' ? 'POST' : 'PATCH';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const headline =
          typeof json.error === 'string'
            ? json.error
            : (json.error?.message ?? 'Failed to save product');
        const fieldErrors = json.details?.fieldErrors as Record<string, string[]> | undefined;
        const fieldList = fieldErrors
          ? Object.entries(fieldErrors)
              .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
              .join(' · ')
          : '';
        toast.error(fieldList ? `${headline} — ${fieldList}` : headline);
        return;
      }

      toast.success(mode === 'create' ? 'Product created' : 'Product updated');
      router.push('/dashboard/profile/shop');
      router.refresh();
    } catch {
      toast.error('Network error, please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (mode !== 'edit' || !initial) return;
    if (!window.confirm('Delete this product? This can’t be undone.')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/products/${initial.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const headline = typeof json.error === 'string' ? json.error : 'Failed to delete product';
        toast.error(headline);
        return;
      }
      toast.success('Product deleted');
      router.push('/dashboard/profile/shop');
      router.refresh();
    } catch {
      toast.error('Network error, please try again.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="max-w-2xl space-y-8">
        {/* Basics */}
        <Section title="Basics" description="What shoppers see first.">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              required
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Hand-embroidered bridal lehenga"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              required
              maxLength={4000}
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Fabric, silhouette, styling, care — what makes this piece special…"
              autoComplete="off"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="garment_type">Garment type *</Label>
              <Select value={garmentType} onValueChange={(v) => setGarmentType(v as GarmentType)}>
                <SelectTrigger id="garment_type" aria-label="Garment type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GARMENT_TYPES.map((g) => (
                    <SelectItem key={g} value={g}>
                      {GARMENT_TYPE_LABELS[g]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ProductStatus)}>
                <SelectTrigger id="status" aria-label="Status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABELS) as ProductStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Section>

        {/* Pricing */}
        <Section title="Pricing" description="Base price for the smallest / default option.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="base_price">Base price *</Label>
              <Input
                id="base_price"
                type="number"
                min={1}
                step={0.01}
                required
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                placeholder="1200"
                inputMode="decimal"
                autoComplete="off"
                className="tabular-nums"
              />
              <p className="text-pretty text-xs text-ink-soft">
                Per-size add-ons are set below in the inventory table.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="currency" aria-label="Currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Section>

        {/* Media */}
        <Section title="Photos & video" description="The first photo is the cover.">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Photos</legend>
            <p className="text-xs text-ink-soft">Up to 12 images.</p>
            <PhotoUploaderDrawer
              value={images}
              onChange={setImages}
              endpoint="portfolioImage"
              maxFiles={12}
              maxSizeMb={16}
              showPrimarySelector
              triggerLabel={{ empty: 'Upload photos', manage: 'Manage photos' }}
            />
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Video clips (optional)</legend>
            <StreamVideoUploader value={videoUids} onChange={setVideoUids} maxClips={4} />
          </fieldset>
        </Section>

        {/* Details */}
        <Section title="Details" description="Optional descriptors shoppers filter and compare on.">
          <div className="grid gap-4 sm:grid-cols-2">
            {ATTRIBUTE_FIELDS.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={`attr_${field.key}`}>{field.label}</Label>
                <Input
                  id={`attr_${field.key}`}
                  value={attributeValues[field.key] ?? ''}
                  onChange={(e) => setAttribute(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  autoComplete="off"
                />
              </div>
            ))}
          </div>
        </Section>

        {/* Fulfilment */}
        <Section title="Fulfilment" description="Shipping, tailoring, and turnaround.">
          <div className="space-y-4">
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <span className="text-sm">Ships internationally</span>
              <Switch
                checked={shipsInternationally}
                onCheckedChange={setShipsInternationally}
                aria-label="Ships internationally"
              />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <span className="text-sm">Tailoring available</span>
              <Switch
                checked={tailoringAvailable}
                onCheckedChange={setTailoringAvailable}
                aria-label="Tailoring available"
              />
            </label>
            <div className="space-y-2 sm:max-w-[calc(50%-0.5rem)]">
              <Label htmlFor="lead_time_days">Lead time (days, optional)</Label>
              <Input
                id="lead_time_days"
                type="number"
                min={1}
                step={1}
                value={leadTimeDays}
                onChange={(e) => setLeadTimeDays(e.target.value)}
                placeholder="21"
                inputMode="numeric"
                autoComplete="off"
                className="tabular-nums"
              />
            </div>
          </div>
        </Section>

        {/* Inventory */}
        <Section
          title="Sizes & inventory"
          description="Add a row per size with its own stock. Skip if made-to-order only."
        >
          <ProductVariantsEditor initial={variants} onChange={setVariants} max={20} />
        </Section>

        <div className="flex flex-wrap gap-3 border-t border-hairline pt-6">
          <Button type="submit" disabled={loading || deleting}>
            {loading ? 'Saving…' : mode === 'create' ? 'Create product' : 'Update product'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={loading || deleting}
          >
            Cancel
          </Button>
          {mode === 'edit' && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleDelete}
              disabled={loading || deleting}
              className="ml-auto text-destructive hover:text-destructive"
            >
              {deleting ? 'Deleting…' : 'Delete product'}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
