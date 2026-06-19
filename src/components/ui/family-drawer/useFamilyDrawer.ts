'use client';

import { createContext, useContext } from 'react';

interface FamilyDrawerContextValue {
  view: string;
  setView: (view: string) => void;
  views: Record<string, React.ComponentType>;
}

export const FamilyDrawerContext = createContext<FamilyDrawerContextValue | null>(null);

export function useFamilyDrawer() {
  const ctx = useContext(FamilyDrawerContext);
  if (!ctx) throw new Error('useFamilyDrawer must be used inside FamilyDrawerRoot');
  return ctx;
}
