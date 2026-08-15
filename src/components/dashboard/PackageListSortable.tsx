'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GripVertical } from 'lucide-react';
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
import { Card, CardContent } from '@/components/ui/card';
import { PackageActiveToggle } from '@/components/dashboard/PackageActiveToggle';
import { PackageFeaturedToggle } from '@/components/dashboard/PackageFeaturedToggle';
import { PackagePreviewButton } from '@/components/dashboard/PackagePreviewButton';
import { PackagePhotoFallback } from '@/components/marketplace/PackagePhotoFallback';
import type { PackageWithAddons } from '@/components/marketplace/PackageGrid';
import { fmtUSD } from '@/lib/intl';
import { formatCapacity } from '@/types';

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

  return (
    <div ref={setNodeRef} style={style}>
      <Card className={`relative overflow-hidden ${!pkg.is_active ? 'opacity-60' : ''}`}>
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

        <div className="relative h-40 w-full">
          {pkg.featured_image_url ? (
            <Image
              src={pkg.featured_image_url}
              alt={pkg.name}
              fill
              className="object-cover"
              unoptimized
            />
          ) : (
            <PackagePhotoFallback name={pkg.name} />
          )}
        </div>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold leading-tight" translate="no">
              {pkg.name}
            </h3>
            {!pkg.is_active && (
              <span className="shrink-0 text-xs uppercase text-muted-foreground">Inactive</span>
            )}
          </div>
          <p className="text-sm tabular-nums text-muted-foreground">
            {fmtUSD(pkg.base_price_cents)}
          </p>
          <p className="text-xs text-muted-foreground">
            {pkg.duration_hours} h &middot; {formatCapacity(pkg.max_guests, pkg.capacity_unit)}
          </p>
          <div className="pt-2">
            <PackageFeaturedToggle packageId={pkg.id} isFeatured={pkg.is_featured} />
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <PackagePreviewButton pkg={pkg} vendorSlug={vendorSlug} />
            <Button size="sm" variant="outline" asChild>
              <Link href={`/dashboard/profile/packages/${pkg.id}`}>Edit</Link>
            </Button>
            <PackageActiveToggle packageId={pkg.id} isActive={pkg.is_active} />
          </div>
        </CardContent>
      </Card>
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((pkg) => (
              <SortableCard key={pkg.id} pkg={pkg} vendorSlug={vendorSlug} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
