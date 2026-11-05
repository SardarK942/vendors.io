'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GripVertical, Package, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { PackageActiveToggle } from '@/components/dashboard/PackageActiveToggle';
import { PackageFeaturedToggle } from '@/components/dashboard/PackageFeaturedToggle';
import { PackagePreviewButton } from '@/components/dashboard/PackagePreviewButton';
import type { PackageWithAddons } from '@/components/marketplace/PackageGrid';
import { cn, formatPrice } from '@/lib/utils';
import { formatPackageMeta } from '@/types';

export type SortablePackage = PackageWithAddons & { is_active: boolean };

interface Props {
  packages: SortablePackage[];
  vendorSlug: string;
}

function SortableCard({ pkg, vendorSlug }: { pkg: SortablePackage; vendorSlug: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pkg.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const meta = formatPackageMeta({
    durationHours: pkg.duration_hours,
    maxGuests: pkg.max_guests,
    capacityUnit: pkg.capacity_unit,
  });
  const metaLine = meta
    ? `${formatPrice(pkg.base_price_cents)} · ${meta}`
    : formatPrice(pkg.base_price_cents);

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={cn(
          'flex flex-col rounded-2xl border border-hairline bg-white p-2 transition-colors hover:border-indigo/30',
          !pkg.is_active && 'opacity-60'
        )}
      >
        {/* Image area */}
        <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-cream-soft">
          {pkg.featured_image_url ? (
            <Image
              src={pkg.featured_image_url}
              alt={pkg.name}
              fill
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <Package className="size-8 text-ink-soft/60" aria-hidden="true" />
            </div>
          )}

          {pkg.is_featured && (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-haldi px-2.5 py-1 text-[11px] font-semibold text-ink">
              <Sparkles className="size-3" aria-hidden="true" />
              Most popular
            </span>
          )}

          {/* Drag handle — isolated from the card's interactive controls so
              clicking Edit/toggles never starts a drag. */}
          <button
            {...attributes}
            {...listeners}
            type="button"
            aria-label={`Reorder ${pkg.name}`}
            className="absolute right-2 top-2 z-10 cursor-grab touch-none rounded-full bg-cream/85 p-2 text-ink shadow-sm ring-1 ring-hairline transition-colors hover:bg-cream active:cursor-grabbing"
          >
            <GripVertical className="size-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-2 p-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-lg leading-tight text-ink" translate="no">
              {pkg.name}
            </h3>
            {!pkg.is_active && (
              <span className="shrink-0 text-xs uppercase text-ink-soft">Inactive</span>
            )}
          </div>
          <p className="text-xs tabular-nums text-ink-soft">{metaLine}</p>

          {/* Controls footer */}
          <div className="mt-auto space-y-3 pt-2">
            <PackageFeaturedToggle packageId={pkg.id} isFeatured={pkg.is_featured} />
            <div className="flex flex-wrap items-center gap-2">
              <PackagePreviewButton pkg={pkg} vendorSlug={vendorSlug} />
              <Button size="sm" variant="outline" asChild>
                <Link href={`/dashboard/profile/packages/${pkg.id}`}>Edit</Link>
              </Button>
            </div>
            <PackageActiveToggle packageId={pkg.id} isActive={pkg.is_active} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Drag-to-reorder grid of the vendor's packages. Order is persisted to
 * display_order via PATCH /api/packages/reorder on each drop; on failure the
 * optimistic order is rolled back. Reordering is disabled for a single package.
 */
export function PackageListSortable({ packages, vendorSlug }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<SortablePackage[]>(packages);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function persist(next: SortablePackage[], prev: SortablePackage[]) {
    try {
      const res = await fetch('/api/packages/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordered_ids: next.map((p) => p.id) }),
      });
      if (!res.ok) {
        setItems(prev);
        const json = await res.json().catch(() => ({}));
        toast.error(json.error?.message ?? 'Failed to save order');
        return;
      }
      router.refresh();
    } catch {
      setItems(prev);
      toast.error('Network error, please try again.');
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((p) => p.id === active.id);
    const newIndex = items.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const prev = items;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    void persist(next, prev);
  }

  // Single package — nothing to reorder; render a plain card grid.
  if (items.length < 2) {
    return (
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((pkg) => (
          <SortableCard key={pkg.id} pkg={pkg} vendorSlug={vendorSlug} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-soft">
        Drag the handle to reorder — this is the order couples see on your profile.
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((p) => p.id)} strategy={rectSortingStrategy}>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((pkg) => (
              <SortableCard key={pkg.id} pkg={pkg} vendorSlug={vendorSlug} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
