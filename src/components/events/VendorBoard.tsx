'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CATEGORIES_FEATURED } from '@/lib/vendor-categories/featured';
import { formatPrice } from '@/lib/utils';
import { dollarsToCents } from '@/lib/events/money';
import type { NeedWithBooking, NeedStatus } from '@/lib/events/derive';
import type { EventFunctionRow } from '@/types/database.types';

export interface UnlinkedBooking {
  id: string;
  status: string;
  vendor_business_name: string;
  category: string;
}

type NeedRow = NeedWithBooking & { status: NeedStatus };

interface VendorBoardProps {
  eventId: string;
  functions: EventFunctionRow[];
  needs: NeedRow[];
  /**
   * The event's city. The marketplace filter surface (src/components/marketplace/filters/
   * use-filter-state.ts) only supports `q` / `category` / `verified` / `respondsIn` /
   * `priceBand` / `priceMin` / `priceMax` / `lang` / `years` / `events` / `subcategories` —
   * there is no `city` param, so it isn't appended to the "Find vendors" deep link. Kept
   * in the prop signature for interface parity in case the marketplace gains city
   * filtering later.
   */
  eventCity: string | null;
  unlinkedBookings: UnlinkedBooking[];
}

const ADDABLE_CATEGORIES = CATEGORIES_FEATURED.filter((c) => !c.comingSoon);

function categoryLabel(slug: string): string {
  return CATEGORIES_FEATURED.find((c) => c.slug === slug)?.label ?? slug;
}

async function callNeedsApi(
  eventId: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body: unknown
): Promise<void> {
  const res = await fetch(`/api/events/${eventId}/needs`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: null }));
    throw new Error(err?.error ?? 'Something went wrong. Please try again.');
  }
}

export function VendorBoard({ eventId, functions, needs, unlinkedBookings }: VendorBoardProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [addVendorFor, setAddVendorFor] = useState<EventFunctionRow | null>(null);
  const [addSlotFor, setAddSlotFor] = useState<EventFunctionRow | null>(null);
  const [editNeed, setEditNeed] = useState<NeedRow | null>(null);
  const [deleteNeed, setDeleteNeed] = useState<NeedRow | null>(null);

  async function runMutation(fn: () => Promise<void>, successMsg: string): Promise<boolean> {
    setBusy(true);
    try {
      await fn();
      toast.success(successMsg);
      router.refresh();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const sortedFunctions = [...functions].sort((a, b) => a.sequence - b.sequence);

  if (functions.length === 0) {
    return (
      <div className="rounded-xl border border-hairline bg-cream-soft/40 px-5 py-8 text-center text-sm text-ink-soft">
        No functions yet — add one to start booking vendors.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {sortedFunctions.map((fn) => {
        const fnNeeds = needs
          .filter((n) => n.event_function_id === fn.id)
          .sort((a, b) => a.sort - b.sort);
        return (
          <div key={fn.id} className="rounded-xl border border-hairline bg-cream p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-display text-lg text-ink">{fn.label}</p>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="tertiary"
                  size="sm"
                  onClick={() => setAddSlotFor(fn)}
                >
                  ＋ Add slot
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setAddVendorFor(fn)}
                >
                  ＋ Add vendor
                </Button>
              </div>
            </div>

            {fnNeeds.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">No vendors needed yet for this function.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {fnNeeds.map((need) => (
                  <NeedRowView
                    key={need.id}
                    need={need}
                    onEdit={() => setEditNeed(need)}
                    onDelete={() => setDeleteNeed(need)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      <AddVendorDialog
        open={addVendorFor != null}
        onOpenChange={(open) => !open && setAddVendorFor(null)}
        fn={addVendorFor}
        unlinkedBookings={unlinkedBookings}
        busy={busy}
        onSubmitManual={async (payload) => {
          if (!addVendorFor) return;
          const ok = await runMutation(
            () =>
              callNeedsApi(eventId, 'POST', {
                op: 'manual',
                event_function_id: addVendorFor.id,
                ...payload,
              }),
            'Vendor added'
          );
          if (ok) setAddVendorFor(null);
        }}
        onLinkBooking={async (bookingId) => {
          if (!addVendorFor) return;
          const ok = await runMutation(
            () =>
              callNeedsApi(eventId, 'POST', {
                op: 'link_booking',
                event_function_id: addVendorFor.id,
                booking_id: bookingId,
              }),
            'Booking linked'
          );
          if (ok) setAddVendorFor(null);
        }}
      />

      <AddSlotDialog
        open={addSlotFor != null}
        onOpenChange={(open) => !open && setAddSlotFor(null)}
        busy={busy}
        onSubmit={async (category) => {
          if (!addSlotFor) return;
          const ok = await runMutation(
            () =>
              callNeedsApi(eventId, 'POST', {
                op: 'add_slot',
                event_function_id: addSlotFor.id,
                category,
              }),
            'Slot added'
          );
          if (ok) setAddSlotFor(null);
        }}
      />

      <EditManualNeedDialog
        need={editNeed}
        onOpenChange={(open) => !open && setEditNeed(null)}
        busy={busy}
        onSubmit={async (payload) => {
          if (!editNeed) return;
          const ok = await runMutation(
            () => callNeedsApi(eventId, 'PATCH', { need_id: editNeed.id, ...payload }),
            'Vendor updated'
          );
          if (ok) setEditNeed(null);
        }}
      />

      <ConfirmDialog
        open={deleteNeed != null}
        onOpenChange={(open) => !open && setDeleteNeed(null)}
        title="Remove this slot?"
        description="This removes it from your vendor board. It won't cancel an existing booking."
        confirmLabel="Remove"
        cancelLabel="Keep slot"
        destructive
        busy={busy}
        onConfirm={async () => {
          if (!deleteNeed) return;
          const ok = await runMutation(
            () => callNeedsApi(eventId, 'DELETE', { need_id: deleteNeed.id }),
            'Slot removed'
          );
          if (ok) setDeleteNeed(null);
        }}
      />
    </div>
  );
}

function NeedRowView({
  need,
  onEdit,
  onDelete,
}: {
  need: NeedRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  if (need.status === 'booked_baazar') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-cream-soft/40 px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">
            {need.booking?.vendor_business_name ?? 'Vendor'}
          </p>
          <p className="text-xs text-ink-soft">
            {categoryLabel(need.category)} · {formatPrice(need.booking?.total_price_cents ?? 0)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {need.booking && (
            <Link
              href={`/dashboard/bookings/${need.booking.id}`}
              className="text-xs font-semibold text-indigo hover:underline"
            >
              View booking →
            </Link>
          )}
          <RemoveButton onClick={onDelete} />
        </div>
      </div>
    );
  }

  if (need.status === 'booked_manual') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-cream-soft/40 px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">
            {need.manual_vendor_name ?? 'Vendor'}
          </p>
          <p className="text-xs text-ink-soft">
            {categoryLabel(need.category)} · {formatPrice(need.manual_amount_cents ?? 0)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={onEdit}
            className="text-xs font-semibold text-indigo hover:underline"
          >
            Edit
          </button>
          <RemoveButton onClick={onDelete} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-hairline px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{categoryLabel(need.category)}</p>
        <p className="text-xs font-medium text-hot-pink">Still needed</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Link
          href={`/vendors?category=${need.category}`}
          className="text-xs font-semibold text-indigo hover:underline"
        >
          Find {categoryLabel(need.category)} vendors →
        </Link>
        <RemoveButton onClick={onDelete} />
      </div>
    </div>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Remove slot"
      className="text-ink-soft hover:text-ink"
    >
      ✕
    </button>
  );
}

function AddVendorDialog({
  open,
  onOpenChange,
  fn,
  unlinkedBookings,
  busy,
  onSubmitManual,
  onLinkBooking,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fn: EventFunctionRow | null;
  unlinkedBookings: UnlinkedBooking[];
  busy: boolean;
  onSubmitManual: (payload: {
    category: string;
    manual_vendor_name: string;
    manual_amount_cents: number | null;
  }) => void;
  onLinkBooking: (bookingId: string) => void;
}) {
  const [category, setCategory] = useState(ADDABLE_CATEGORIES[0]?.slug ?? '');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');

  function handleSubmitManual() {
    const manual_amount_cents = dollarsToCents(amount);
    if (manual_amount_cents === undefined) {
      toast.error('Enter a valid amount');
      return;
    }
    onSubmitManual({ category, manual_vendor_name: name.trim(), manual_amount_cents });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setCategory(ADDABLE_CATEGORIES[0]?.slug ?? '');
          setName('');
          setAmount('');
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a vendor{fn ? ` — ${fn.label}` : ''}</DialogTitle>
          <DialogDescription>
            Note a vendor you booked off Baazar, or link an existing Baazar booking.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="manual">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual">Booked off Baazar</TabsTrigger>
            <TabsTrigger value="link">Link a Baazar booking</TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="vb-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="vb-category">
                  <SelectValue placeholder="Choose a category" />
                </SelectTrigger>
                <SelectContent>
                  {ADDABLE_CATEGORIES.map((c) => (
                    <SelectItem key={c.slug} value={c.slug}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vb-name">Vendor name</Label>
              <Input
                id="vb-name"
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
                placeholder="Vendor name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vb-amount">Amount (optional)</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-soft">
                  $
                </span>
                <Input
                  id="vb-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  className="pl-6"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                disabled={busy || !category || !name.trim()}
                onClick={handleSubmitManual}
              >
                Add vendor
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="link" className="space-y-2 pt-2">
            {unlinkedBookings.length === 0 ? (
              <p className="py-4 text-center text-sm text-ink-soft">
                No unbooked Baazar bookings to link. Every booking is already tied to a function.
              </p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {unlinkedBookings.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-hairline px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {b.vendor_business_name}
                      </p>
                      <p className="text-xs text-ink-soft">{categoryLabel(b.category)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => onLinkBooking(b.id)}
                    >
                      Link
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function AddSlotDialog({
  open,
  onOpenChange,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onSubmit: (category: string) => void;
}) {
  const [category, setCategory] = useState(ADDABLE_CATEGORIES[0]?.slug ?? '');

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setCategory(ADDABLE_CATEGORIES[0]?.slug ?? '');
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add a vendor slot</DialogTitle>
          <DialogDescription>
            Mark a category as something you still need to book, with no vendor attached yet.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="slot-category">Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="slot-category">
              <SelectValue placeholder="Choose a category" />
            </SelectTrigger>
            <SelectContent>
              {ADDABLE_CATEGORIES.map((c) => (
                <SelectItem key={c.slug} value={c.slug}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button type="button" disabled={busy || !category} onClick={() => onSubmit(category)}>
            Add slot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditManualNeedDialog({
  need,
  onOpenChange,
  busy,
  onSubmit,
}: {
  need: NeedRow | null;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onSubmit: (payload: { manual_vendor_name: string; manual_amount_cents: number | null }) => void;
}) {
  const [name, setName] = useState(need?.manual_vendor_name ?? '');
  const [amount, setAmount] = useState(
    need?.manual_amount_cents != null ? String(need.manual_amount_cents / 100) : ''
  );

  function handleSubmit() {
    const manual_amount_cents = dollarsToCents(amount);
    if (manual_amount_cents === undefined) {
      toast.error('Enter a valid amount');
      return;
    }
    onSubmit({ manual_vendor_name: name.trim(), manual_amount_cents });
  }

  return (
    <Dialog
      key={need?.id}
      open={need != null}
      onOpenChange={(next) => {
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit vendor</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="edit-vb-name">Vendor name</Label>
            <Input
              id="edit-vb-name"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-vb-amount">Amount</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-soft">
                $
              </span>
              <Input
                id="edit-vb-amount"
                type="number"
                min={0}
                step="0.01"
                className="pl-6"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" disabled={busy || !name.trim()} onClick={handleSubmit}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
