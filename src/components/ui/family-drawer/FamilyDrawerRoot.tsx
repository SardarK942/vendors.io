'use client';
import { useState } from 'react';
import { Drawer } from 'vaul';
import { FamilyDrawerContext } from './useFamilyDrawer';

export type ViewsRegistry = Record<string, React.ComponentType>;

interface RootProps {
  views: ViewsRegistry;
  defaultView?: string;
  children: React.ReactNode;
}

export function FamilyDrawerRoot({ views, defaultView = 'default', children }: RootProps) {
  const [view, setView] = useState(defaultView);
  const [open, setOpen] = useState(false);

  return (
    <FamilyDrawerContext.Provider value={{ view, setView, views }}>
      <Drawer.Root
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setView(defaultView);
        }}
      >
        {children}
      </Drawer.Root>
    </FamilyDrawerContext.Provider>
  );
}
