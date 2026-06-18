'use client';
import { Drawer } from 'vaul';

export function FamilyDrawerContent({ children }: { children: React.ReactNode }) {
  return (
    <Drawer.Content className="fixed bottom-0 left-0 right-0 mx-auto max-w-md rounded-t-2xl bg-cream p-6 outline-none">
      <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-ink/20" />
      {children}
    </Drawer.Content>
  );
}
