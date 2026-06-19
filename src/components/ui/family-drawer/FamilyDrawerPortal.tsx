'use client';
import { Drawer } from 'vaul';

export function FamilyDrawerPortal({ children }: { children: React.ReactNode }) {
  return <Drawer.Portal>{children}</Drawer.Portal>;
}
