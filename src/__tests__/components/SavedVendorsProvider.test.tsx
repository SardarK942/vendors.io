// src/__tests__/components/SavedVendorsProvider.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  SavedVendorsProvider,
  useSavedVendors,
} from '@/components/marketplace/SavedVendorsProvider';

describe('SavedVendorsProvider', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('hydrates savedIds from GET on mount', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ vendor_profile_id: 'vp-1', saved_at: 'x' }] }),
    });
    const { result } = renderHook(() => useSavedVendors(), {
      wrapper: SavedVendorsProvider,
    });
    await waitFor(() => expect(result.current.savedIds.has('vp-1')).toBe(true));
  });

  it('toggle adds and removes optimistically', async () => {
    // First call: GET returns empty
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });
    // Toggle add: POST returns first_save: true
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { first_save: true } }),
    });
    // Toggle remove: DELETE returns ok
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true }),
    });

    const { result } = renderHook(() => useSavedVendors(), {
      wrapper: SavedVendorsProvider,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      const r = await result.current.toggle('vp-1');
      expect(r.isFirstSave).toBe(true);
      expect(r.wasSaved).toBe(true);
    });
    expect(result.current.savedIds.has('vp-1')).toBe(true);

    await act(async () => {
      const r = await result.current.toggle('vp-1');
      expect(r.wasSaved).toBe(false); // already saved → removed
    });
    expect(result.current.savedIds.has('vp-1')).toBe(false);
  });
});
