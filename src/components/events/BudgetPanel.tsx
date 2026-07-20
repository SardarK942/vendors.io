'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CATEGORIES_FEATURED } from '@/lib/vendor-categories/featured';
import { formatPrice } from '@/lib/utils';
import { dollarsToCents } from '@/lib/events/money';
import type { Rollups } from '@/lib/events/derive';
import type { Database, EventFunctionRow, EventRow } from '@/types/database.types';

type AllocationRow = Database['public']['Tables']['event_budget_allocations']['Row'];

interface BudgetPanelProps {
  event: EventRow;
  rollups: Rollups;
  allocations: AllocationRow[];
  functions: EventFunctionRow[];
}

function categoryLabel(slug: string): string {
  return CATEGORIES_FEATURED.find((c) => c.slug === slug)?.label ?? slug;
}

function BudgetRow({
  label,
  committedCents,
  plannedCents,
}: {
  label: string;
  committedCents: number;
  plannedCents: number | null;
}) {
  const overPlanned = plannedCents != null && committedCents > plannedCents;
  const percent =
    plannedCents != null && plannedCents > 0
      ? Math.min(100, (committedCents / plannedCents) * 100)
      : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium text-ink">{label}</span>
        <span className="flex items-center gap-1.5 text-ink-soft">
          {formatPrice(committedCents)}
          {plannedCents != null && ` of ${formatPrice(plannedCents)}`}
          {overPlanned && (
            <Badge variant="outline" className="border-hot-pink text-hot-pink">
              Over
            </Badge>
          )}
        </span>
      </div>
      {plannedCents != null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-muted/10">
          <div
            className={
              overPlanned ? 'h-full rounded-full bg-hot-pink' : 'h-full rounded-full bg-indigo'
            }
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function BudgetPanel({ event, rollups, allocations, functions }: BudgetPanelProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [budgetInput, setBudgetInput] = useState(
    event.total_budget_cents != null ? String(event.total_budget_cents / 100) : ''
  );
  const [busy, setBusy] = useState(false);

  const total = event.total_budget_cents;
  const remaining = total != null ? Math.max(0, total - rollups.totalCommittedCents) : null;
  const percentCommitted =
    total != null && total > 0 ? Math.min(100, (rollups.totalCommittedCents / total) * 100) : 0;

  const categorySlugs = Array.from(
    new Set([...allocations.map((a) => a.category), ...Object.keys(rollups.byCategory)])
  );
  const sortedFunctions = [...functions].sort((a, b) => a.sequence - b.sequence);

  async function handleSaveBudget() {
    const cents = dollarsToCents(budgetInput);
    if (cents === undefined) {
      toast.error('Enter a valid amount');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/events/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ total_budget_cents: cents }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: null }));
        throw new Error(err?.error ?? 'Could not save your budget. Please try again.');
      }
      toast.success('Budget saved');
      setEditOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not save your budget. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id="budget-panel" className="border-hairline shadow-none">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <p className="font-display text-lg text-ink">Budget</p>
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="text-xs font-semibold text-indigo hover:underline"
        >
          {total != null ? 'Edit' : 'Set a budget'}
        </button>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {total == null ? (
          <p className="text-sm text-ink-soft">
            Set a total budget to track committed spend against it.
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-muted/10">
                <div
                  className="h-full rounded-full bg-ink"
                  style={{ width: `${percentCommitted}%` }}
                />
              </div>
              <p className="text-xs text-ink-soft">
                {formatPrice(rollups.totalCommittedCents)} committed of {formatPrice(total)} ·{' '}
                {formatPrice(remaining ?? 0)} remaining
              </p>
            </div>

            <Tabs defaultValue="category">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="category">By category</TabsTrigger>
                <TabsTrigger value="function">By function</TabsTrigger>
              </TabsList>
              <TabsContent value="category" className="space-y-3 pt-3">
                {categorySlugs.length === 0 ? (
                  <p className="text-sm text-ink-soft">No categories tracked yet.</p>
                ) : (
                  categorySlugs.map((slug) => {
                    const allocation = allocations.find((a) => a.category === slug);
                    return (
                      <BudgetRow
                        key={slug}
                        label={categoryLabel(slug)}
                        committedCents={rollups.byCategory[slug] ?? 0}
                        plannedCents={allocation?.planned_cents ?? null}
                      />
                    );
                  })
                )}
              </TabsContent>
              <TabsContent value="function" className="space-y-3 pt-3">
                {sortedFunctions.length === 0 ? (
                  <p className="text-sm text-ink-soft">No functions yet.</p>
                ) : (
                  sortedFunctions.map((fn) => (
                    <BudgetRow
                      key={fn.id}
                      label={fn.label}
                      committedCents={rollups.byFunction[fn.id] ?? 0}
                      plannedCents={null}
                    />
                  ))
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </CardContent>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{total != null ? 'Edit budget' : 'Set a budget'}</DialogTitle>
            <DialogDescription>
              Track committed spend against a total for this celebration.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="total-budget-input">Total budget</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-soft">
                $
              </span>
              <Input
                id="total-budget-input"
                type="number"
                min={0}
                step="0.01"
                className="pl-6"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" disabled={busy} onClick={handleSaveBudget}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
