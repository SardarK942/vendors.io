'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// A single inventory row for a product (size + stock + optional up-charge/SKU).
// Mirrors PackageAddonsEditor's controlled add/remove pattern. price_delta is
// held in CENTS here (the schema is cents) but edited in dollars in the UI.
export interface VariantDraft {
  size_label: string;
  sku: string;
  price_delta_cents: number;
  stock_quantity: number;
}

interface Props {
  initial?: VariantDraft[];
  onChange: (variants: VariantDraft[]) => void;
  max?: number;
}

// Common bridal-wear sizing hints — offered via a datalist so vendors can also
// type a free-form label (e.g. "Custom", "Made to measure", "One size").
const SIZE_SUGGESTIONS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Custom'] as const;

export function ProductVariantsEditor({ initial = [], onChange, max = 20 }: Props) {
  const [variants, setVariants] = useState<VariantDraft[]>(initial);

  function update(next: VariantDraft[]) {
    setVariants(next);
    onChange(next);
  }

  function setSize(i: number, value: string) {
    update(variants.map((v, j) => (j === i ? { ...v, size_label: value } : v)));
  }
  function setSku(i: number, value: string) {
    update(variants.map((v, j) => (j === i ? { ...v, sku: value } : v)));
  }
  function setStock(i: number, raw: string) {
    const n = parseInt(raw || '0', 10);
    const safe = isNaN(n) || n < 0 ? 0 : n;
    update(variants.map((v, j) => (j === i ? { ...v, stock_quantity: safe } : v)));
  }
  function setPriceDelta(i: number, raw: string) {
    const dollars = parseFloat(raw || '0');
    const safeDollars = isNaN(dollars) || dollars < 0 ? 0 : dollars;
    const cents = Math.round(safeDollars * 100);
    update(variants.map((v, j) => (j === i ? { ...v, price_delta_cents: cents } : v)));
  }
  function removeVariant(i: number) {
    update(variants.filter((_, j) => j !== i));
  }
  function addVariant() {
    update([...variants, { size_label: '', sku: '', price_delta_cents: 0, stock_quantity: 0 }]);
  }

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Sizes & inventory (optional, max {max})</legend>
      <datalist id="variant-size-suggestions">
        {SIZE_SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {variants.length > 0 && (
        <div className="space-y-3">
          {variants.map((v, i) => (
            <div
              key={i}
              className="grid gap-2 rounded-md border border-hairline p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            >
              <div className="space-y-1">
                <Label htmlFor={`variant_size_${i}`} className="text-xs">
                  Size
                </Label>
                <Input
                  id={`variant_size_${i}`}
                  list="variant-size-suggestions"
                  placeholder="e.g. M or Custom"
                  maxLength={40}
                  value={v.size_label}
                  onChange={(e) => setSize(i, e.target.value)}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor={`variant_sku_${i}`} className="text-xs">
                  SKU (optional)
                </Label>
                <Input
                  id={`variant_sku_${i}`}
                  placeholder="e.g. LEH-RED-M"
                  maxLength={60}
                  value={v.sku}
                  onChange={(e) => setSku(i, e.target.value)}
                  autoComplete="off"
                />
              </div>

              <Button
                type="button"
                variant="ghost"
                size="default"
                onClick={() => removeVariant(i)}
                aria-label="Remove size"
                className="justify-self-start sm:mb-0.5"
              >
                &times;
              </Button>

              <div className="space-y-1">
                <Label htmlFor={`variant_stock_${i}`} className="text-xs">
                  Stock
                </Label>
                <Input
                  id={`variant_stock_${i}`}
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  placeholder="0"
                  value={Number.isFinite(v.stock_quantity) ? v.stock_quantity : ''}
                  onChange={(e) => setStock(i, e.target.value)}
                  autoComplete="off"
                  className="tabular-nums"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor={`variant_delta_${i}`} className="text-xs">
                  Price add-on ($)
                </Label>
                <Input
                  id={`variant_delta_${i}`}
                  type="number"
                  min={0}
                  step={0.01}
                  inputMode="decimal"
                  placeholder="0"
                  value={v.price_delta_cents === 0 ? '' : v.price_delta_cents / 100}
                  onChange={(e) => setPriceDelta(i, e.target.value)}
                  autoComplete="off"
                  className="tabular-nums"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {variants.length < max && (
        <Button type="button" variant="outline" size="sm" onClick={addVariant}>
          + Add size
        </Button>
      )}
      <p className="text-pretty text-xs text-ink-soft">
        Each size tracks its own stock. Leave empty if you sell made-to-order only.
      </p>
    </fieldset>
  );
}
