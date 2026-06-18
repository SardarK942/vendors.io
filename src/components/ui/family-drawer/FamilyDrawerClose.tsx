'use client';
import { Drawer } from 'vaul';
import { X } from 'lucide-react';

export function FamilyDrawerClose() {
  return (
    <Drawer.Close className="absolute right-4 top-4 text-ink/40 hover:text-ink" aria-label="Close">
      <X className="size-5" />
    </Drawer.Close>
  );
}
