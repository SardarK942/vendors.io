'use client';
import { Drawer } from 'vaul';

export function FamilyDrawerTrigger({
  children,
  className,
  asChild,
}: {
  children: React.ReactNode;
  className?: string;
  asChild?: boolean;
}) {
  return (
    <Drawer.Trigger className={className} asChild={asChild}>
      {children}
    </Drawer.Trigger>
  );
}
