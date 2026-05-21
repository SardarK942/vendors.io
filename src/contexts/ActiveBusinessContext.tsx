// src/contexts/ActiveBusinessContext.tsx
//
// Sub-project I §3 + §8. Client-side context that exposes the caller's active
// business id to nested client components (e.g., booking action handlers
// that need to know if a booking is cross-business).
'use client';

import { createContext, useContext } from 'react';

interface ActiveBusinessContextValue {
  activeBusinessId: string | null;
}

const ActiveBusinessContext = createContext<ActiveBusinessContextValue>({
  activeBusinessId: null,
});

export function ActiveBusinessProvider({
  children,
  activeBusinessId,
}: {
  children: React.ReactNode;
  activeBusinessId: string | null;
}) {
  return (
    <ActiveBusinessContext.Provider value={{ activeBusinessId }}>
      {children}
    </ActiveBusinessContext.Provider>
  );
}

export function useActiveBusinessId(): string | null {
  return useContext(ActiveBusinessContext).activeBusinessId;
}
