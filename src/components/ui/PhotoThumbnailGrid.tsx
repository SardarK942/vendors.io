'use client';
import { useState } from 'react';
import { Star, X, GripVertical } from 'lucide-react';
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
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface Props {
  urls: string[];
  showPrimarySelector?: boolean;
  onRemove: (idx: number) => void;
  onSetPrimary: (idx: number) => void;
  onReorder: (newOrder: string[]) => void;
}

function SortableThumbnail({
  url,
  idx,
  showPrimarySelector,
  onRemove,
  onSetPrimary,
}: {
  url: string;
  idx: number;
  showPrimarySelector?: boolean;
  onRemove: (idx: number) => void;
  onSetPrimary: (idx: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: url,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative aspect-square overflow-hidden rounded-md"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- thumb grid; w/h reserves an aspect-square box to prevent CLS */}
      <img
        src={url}
        alt=""
        width={200}
        height={200}
        loading="lazy"
        className="h-full w-full object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
      />
      {showPrimarySelector && idx === 0 && (
        <span className="absolute left-1 top-1 z-10 rounded-full bg-hot-pink px-2 py-0.5 text-[10px] font-medium text-cream">
          Primary
        </span>
      )}
      <button
        {...attributes}
        {...listeners}
        type="button"
        aria-label="Reorder"
        className="absolute bottom-1 left-1 z-10 cursor-grab rounded-full bg-cream/80 p-2.5 text-ink opacity-0 transition-opacity before:absolute before:-inset-1 before:content-[''] group-hover:opacity-100"
      >
        <GripVertical className="size-3" aria-hidden="true" />
      </button>
      <div className="absolute inset-0 flex items-center justify-center gap-2 bg-ink/60 opacity-0 transition-opacity group-hover:opacity-100">
        {showPrimarySelector && idx !== 0 && (
          <button
            type="button"
            onClick={() => onSetPrimary(idx)}
            aria-label="Set as primary"
            className="rounded-full bg-cream p-3 text-ink hover:bg-cream/80"
          >
            <Star className="size-4" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onRemove(idx)}
          aria-label="Remove photo"
          className="rounded-full bg-cream p-3 text-hot-pink hover:bg-cream/80"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function PhotoThumbnailGrid({
  urls,
  showPrimarySelector,
  onRemove,
  onSetPrimary,
  onReorder,
}: Props) {
  const [pendingRemoveIdx, setPendingRemoveIdx] = useState<number | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = urls.indexOf(active.id as string);
    const newIndex = urls.indexOf(over.id as string);
    onReorder(arrayMove(urls, oldIndex, newIndex));
  }

  if (urls.length === 0) return null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={urls} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-3 gap-3">
          {urls.map((url, i) => (
            <SortableThumbnail
              key={url}
              url={url}
              idx={i}
              showPrimarySelector={showPrimarySelector}
              onRemove={(idx) => setPendingRemoveIdx(idx)}
              onSetPrimary={onSetPrimary}
            />
          ))}
        </div>
      </SortableContext>

      <ConfirmDialog
        open={pendingRemoveIdx !== null}
        onOpenChange={(o) => {
          if (!o) setPendingRemoveIdx(null);
        }}
        title="Remove This Photo?"
        description="You'll lose any caption you've added."
        confirmLabel="Remove Photo"
        destructive
        onConfirm={() => {
          if (pendingRemoveIdx !== null) {
            onRemove(pendingRemoveIdx);
            setPendingRemoveIdx(null);
          }
        }}
      />
    </DndContext>
  );
}
