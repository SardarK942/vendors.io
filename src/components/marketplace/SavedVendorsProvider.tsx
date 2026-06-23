'use client';

import * as React from 'react';

interface SavedVendorsContextValue {
  savedIds: Set<string>;
  toggle: (vendorId: string) => Promise<{ isFirstSave: boolean; wasSaved: boolean }>;
  isLoading: boolean;
}

const SavedVendorsContext = React.createContext<SavedVendorsContextValue | null>(null);

export function SavedVendorsProvider({ children }: { children: React.ReactNode }) {
  const [savedIds, setSavedIds] = React.useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/users/me/saved')
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => {
        if (cancelled) return;
        setSavedIds(
          new Set((j.data ?? []).map((r: { vendor_profile_id: string }) => r.vendor_profile_id))
        );
      })
      .catch(() => {
        if (cancelled) return;
        setSavedIds(new Set());
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = React.useCallback(
    async (vendorId: string): Promise<{ isFirstSave: boolean; wasSaved: boolean }> => {
      const wasAlreadySaved = savedIds.has(vendorId);
      // Optimistic update
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (wasAlreadySaved) next.delete(vendorId);
        else next.add(vendorId);
        return next;
      });
      try {
        if (wasAlreadySaved) {
          await fetch(`/api/users/me/saved/${vendorId}`, { method: 'DELETE' });
          return { isFirstSave: false, wasSaved: false };
        } else {
          const res = await fetch('/api/users/me/saved', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ vendor_profile_id: vendorId }),
          });
          const j = await res.json();
          return { isFirstSave: j.data?.first_save === true, wasSaved: true };
        }
      } catch (err) {
        // Revert on error
        setSavedIds((prev) => {
          const next = new Set(prev);
          if (wasAlreadySaved) next.add(vendorId);
          else next.delete(vendorId);
          return next;
        });
        throw err;
      }
    },
    [savedIds]
  );

  return (
    <SavedVendorsContext.Provider value={{ savedIds, toggle, isLoading }}>
      {children}
    </SavedVendorsContext.Provider>
  );
}

export function useSavedVendors(): SavedVendorsContextValue {
  const ctx = React.useContext(SavedVendorsContext);
  if (!ctx) {
    // Provider-less fallback — returns no-op for components used outside provider
    return {
      savedIds: new Set(),
      toggle: async () => ({ isFirstSave: false, wasSaved: false }),
      isLoading: false,
    };
  }
  return ctx;
}
