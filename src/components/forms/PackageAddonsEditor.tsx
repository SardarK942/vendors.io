'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface AddonDraft {
  name: string;
  price_delta_cents: number;
}

interface Props {
  initial?: AddonDraft[];
  onChange: (addons: AddonDraft[]) => void;
  max?: number;
}

export function PackageAddonsEditor({ initial = [], onChange, max = 8 }: Props) {
  const [addons, setAddons] = useState<AddonDraft[]>(initial);

  function update(next: AddonDraft[]) {
    setAddons(next);
    onChange(next);
  }

  function handleNameChange(i: number, value: string) {
    update(addons.map((a, j) => (j === i ? { ...a, name: value } : a)));
  }

  function handlePriceChange(i: number, raw: string) {
    const dollars = parseFloat(raw || '0');
    const safeDollars = isNaN(dollars) || dollars < 0 ? 0 : dollars;
    const cents = Math.round(safeDollars * 100);
    update(addons.map((a, j) => (j === i ? { ...a, price_delta_cents: cents } : a)));
  }

  function removeAddon(i: number) {
    update(addons.filter((_, j) => j !== i));
  }

  function addAddon() {
    update([...addons, { name: '', price_delta_cents: 0 }]);
  }

  return (
    <div className="space-y-3">
      <Label>Add-ons (optional, max {max})</Label>
      {addons.length > 0 && (
        <div className="space-y-2">
          {addons.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                type="text"
                placeholder="Add-on name (e.g. Drone footage)"
                value={a.name}
                onChange={(e) => handleNameChange(i, e.target.value)}
                className="flex-1"
              />
              <div className="flex shrink-0 items-center gap-1">
                <span className="text-sm text-muted-foreground">$</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min="0"
                  className="w-24"
                  value={a.price_delta_cents === 0 ? '' : a.price_delta_cents / 100}
                  placeholder="0"
                  onChange={(e) => handlePriceChange(i, e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeAddon(i)}
                aria-label="Remove add-on"
              >
                &times;
              </Button>
            </div>
          ))}
        </div>
      )}
      {addons.length < max && (
        <Button type="button" variant="outline" size="sm" onClick={addAddon}>
          + Add-on
        </Button>
      )}
    </div>
  );
}
