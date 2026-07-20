'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CATEGORIES_FEATURED } from '@/lib/vendor-categories/featured';
import type { WizardFunction } from './wizard-state';
import { cn } from '@/lib/utils';

interface StepVendorsProps {
  functions: WizardFunction[];
  onChange: (functions: WizardFunction[]) => void;
}

const CHIP_CATEGORIES = CATEGORIES_FEATURED.filter((c) => !c.comingSoon);

export function StepVendors({ functions, onChange }: StepVendorsProps) {
  function updateFunction(index: number, patch: Partial<WizardFunction>) {
    onChange(functions.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function toggleCategory(index: number, slug: string) {
    const f = functions[index];
    const selected = f.categories.includes(slug);
    if (selected) {
      const restBooked = { ...f.booked };
      delete restBooked[slug];
      updateFunction(index, {
        categories: f.categories.filter((c) => c !== slug),
        booked: restBooked,
      });
    } else {
      updateFunction(index, { categories: [...f.categories, slug] });
    }
  }

  function toggleBooked(index: number, slug: string, checked: boolean) {
    const f = functions[index];
    if (checked) {
      updateFunction(index, {
        booked: { ...f.booked, [slug]: { name: '', amountCents: null } },
      });
    } else {
      const restBooked = { ...f.booked };
      delete restBooked[slug];
      updateFunction(index, { booked: restBooked });
    }
  }

  function updateBooked(
    index: number,
    slug: string,
    patch: Partial<{ name: string; amountCents: number | null }>
  ) {
    const f = functions[index];
    const current = f.booked[slug] ?? { name: '', amountCents: null };
    updateFunction(index, { booked: { ...f.booked, [slug]: { ...current, ...patch } } });
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-indigo">
          Step 3 of 5
        </p>
        <h1 className="mt-2 font-display text-3xl text-ink">What do you still need to book?</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Pick vendor categories per function. Already have someone booked? Note them below.
        </p>
      </div>

      {functions.length === 0 && (
        <p className="text-sm text-ink-soft">
          No functions yet — go back to add one, or skip ahead.
        </p>
      )}

      <div className="space-y-6">
        {functions.map((f, i) => (
          <Card key={`${f.label}-${i}`} className="border-hairline bg-cream shadow-none">
            <CardHeader className="pb-3">
              <p className="font-semibold text-ink">{f.label}</p>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="flex flex-wrap gap-2">
                {CHIP_CATEGORIES.map((c) => {
                  const active = f.categories.includes(c.slug);
                  return (
                    <button
                      key={c.slug}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleCategory(i, c.slug)}
                      className={cn(
                        'rounded-full border-[1.5px] px-3.5 py-1.5 text-sm font-medium transition-colors',
                        active
                          ? 'border-indigo bg-indigo/10 text-indigo'
                          : 'border-hairline bg-cream text-ink hover:border-indigo/50'
                      )}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>

              {f.categories.length > 0 && (
                <div className="space-y-3 border-t border-hairline pt-4">
                  {f.categories.map((slug) => {
                    const category = CHIP_CATEGORIES.find((c) => c.slug === slug);
                    const booked = f.booked[slug];
                    return (
                      <div key={slug} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor={`booked-${i}-${slug}`} className="text-sm text-ink">
                            {category?.label ?? slug} — already booked?
                          </Label>
                          <Switch
                            id={`booked-${i}-${slug}`}
                            checked={booked != null}
                            onCheckedChange={(checked) => toggleBooked(i, slug, checked)}
                          />
                        </div>
                        {booked != null && (
                          <div className="grid grid-cols-2 gap-2 pl-1">
                            <Input
                              value={booked.name}
                              placeholder="Vendor name"
                              maxLength={120}
                              onChange={(e) => updateBooked(i, slug, { name: e.target.value })}
                            />
                            <Input
                              type="number"
                              step="0.01"
                              min={0}
                              value={booked.amountCents != null ? booked.amountCents / 100 : ''}
                              placeholder="$ amount"
                              onChange={(e) =>
                                updateBooked(i, slug, {
                                  amountCents: e.target.value
                                    ? Math.round(parseFloat(e.target.value) * 100)
                                    : null,
                                })
                              }
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
