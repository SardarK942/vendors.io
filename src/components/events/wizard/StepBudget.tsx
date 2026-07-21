'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { CATEGORIES_FEATURED } from '@/lib/vendor-categories/featured';
import { formatPrice } from '@/lib/utils';

interface StepBudgetProps {
  totalBudgetCents: number | null;
  allocations: Record<string, number>;
  categories: string[];
  onTotalChange: (totalBudgetCents: number | null) => void;
  onAllocationsChange: (allocations: Record<string, number>) => void;
}

function categoryLabel(slug: string): string {
  return CATEGORIES_FEATURED.find((c) => c.slug === slug)?.label ?? slug;
}

/** Even split of `total` across `categories`, remainder cents on the first slot. */
function seedAllocations(categories: string[], total: number): Record<string, number> {
  if (categories.length === 0 || total <= 0) return {};
  const share = Math.floor(total / categories.length);
  const remainder = total - share * categories.length;
  const result: Record<string, number> = {};
  categories.forEach((c, i) => {
    result[c] = share + (i === 0 ? remainder : 0);
  });
  return result;
}

/**
 * Moves `changed` to `newValue` (clamped to [0, total]) and proportionally
 * redistributes the rest of `total` across the other categories, preserving
 * their relative proportions from the seed. Guarantees the allocations never
 * sum to more than `total`.
 */
function rebalance(
  allocations: Record<string, number>,
  changed: string,
  newValue: number,
  total: number
): Record<string, number> {
  const clampedNew = Math.min(Math.max(0, newValue), total);
  const others = Object.keys(allocations).filter((c) => c !== changed);
  const result: Record<string, number> = { ...allocations, [changed]: clampedNew };
  const remaining = total - clampedNew;

  if (others.length === 0) return result;

  const othersCurrentSum = others.reduce((sum, c) => sum + (allocations[c] ?? 0), 0);
  let assigned = 0;
  others.forEach((c, i) => {
    const isLast = i === others.length - 1;
    const share =
      othersCurrentSum === 0
        ? Math.floor(remaining / others.length)
        : Math.round(((allocations[c] ?? 0) / othersCurrentSum) * remaining);
    const value = isLast ? remaining - assigned : Math.max(0, share);
    result[c] = Math.max(0, value);
    assigned += result[c];
  });
  return result;
}

export function StepBudget({
  totalBudgetCents,
  allocations,
  categories,
  onTotalChange,
  onAllocationsChange,
}: StepBudgetProps) {
  const seededRef = useRef(false);

  // Seed sliders proportionally the first time we have both a total and a
  // category list. Only runs once (per session) so it doesn't clobber
  // manual slider adjustments made afterward.
  useEffect(() => {
    if (seededRef.current) return;
    if (categories.length === 0 || !totalBudgetCents || totalBudgetCents <= 0) return;
    if (Object.keys(allocations).length > 0) {
      seededRef.current = true;
      return;
    }
    seededRef.current = true;
    onAllocationsChange(seedAllocations(categories, totalBudgetCents));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, totalBudgetCents]);

  // If the total shrinks below what's already allocated (e.g. user lowers the
  // budget after adjusting sliders), rescale allocations down proportionally
  // so the sum never exceeds the new total.
  useEffect(() => {
    if (!totalBudgetCents) return;
    const keys = Object.keys(allocations);
    const sum = keys.reduce((s, k) => s + allocations[k], 0);
    if (keys.length === 0 || sum <= totalBudgetCents) return;
    const scale = totalBudgetCents / sum;
    let assigned = 0;
    const scaled: Record<string, number> = {};
    keys.forEach((k, i) => {
      const isLast = i === keys.length - 1;
      const value = isLast
        ? totalBudgetCents - assigned
        : Math.max(0, Math.floor(allocations[k] * scale));
      scaled[k] = value;
      assigned += value;
    });
    onAllocationsChange(scaled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalBudgetCents]);

  // Only count categories still selected by a function — a category can be
  // deselected in Step 3 after Step 4 already seeded/adjusted a slider for
  // it, leaving an orphaned entry in `allocations` that shouldn't inflate
  // the displayed total (toPayload prunes these before submit too).
  const liveCategories = useMemo(() => new Set(categories), [categories]);
  const sumAllocated = Object.entries(allocations).reduce(
    (s, [category, v]) => (liveCategories.has(category) ? s + v : s),
    0
  );
  const total = totalBudgetCents ?? 0;
  const percentAllocated = total > 0 ? Math.round((sumAllocated / total) * 100) : 0;
  const unassignedCents = Math.max(0, total - sumAllocated);

  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-indigo">
          Step 4 of 5
        </p>
        <h1 className="mt-2 font-display text-3xl text-ink">What&apos;s your budget?</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Set a total, then split it across what you&apos;re planning to book.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="total-budget">Total budget</Label>
        <div className="relative w-48">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-soft">
            $
          </span>
          <Input
            id="total-budget"
            type="number"
            min={0}
            step="0.01"
            className="pl-6"
            value={totalBudgetCents != null ? totalBudgetCents / 100 : ''}
            placeholder="0.00"
            onChange={(e) =>
              onTotalChange(e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null)
            }
          />
        </div>
      </div>

      {categories.length > 0 && total > 0 && (
        <div className="space-y-5">
          {categories.map((slug) => {
            const value = allocations[slug] ?? 0;
            return (
              <div key={slug} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-ink">{categoryLabel(slug)}</span>
                  <span className="text-ink-soft">{formatPrice(value)}</span>
                </div>
                <Slider
                  min={0}
                  max={total}
                  step={100}
                  value={[value]}
                  onValueChange={([v]) =>
                    onAllocationsChange(rebalance(allocations, slug, v, total))
                  }
                />
              </div>
            );
          })}

          <p className="font-mono text-xs text-ink-soft">
            {percentAllocated}% allocated · {formatPrice(unassignedCents)} unassigned
          </p>
        </div>
      )}

      {categories.length === 0 && (
        <p className="text-sm text-ink-soft">
          No vendor categories selected yet — you can still set a total and split it up later.
        </p>
      )}
    </div>
  );
}
