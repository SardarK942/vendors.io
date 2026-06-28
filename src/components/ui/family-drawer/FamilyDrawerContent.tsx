'use client';
import { Drawer } from 'vaul';

export function FamilyDrawerContent({ children }: { children: React.ReactNode }) {
  return (
    <Drawer.Content className="fixed bottom-0 left-0 right-0 mx-auto max-w-md rounded-t-2xl bg-cream p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream">
      <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-ink/20" />
      {children}
    </Drawer.Content>
  );
}
