// Typed UploadThing helpers for client components.
// The route handler is at src/app/api/uploadthing/route.ts.
// File router definition is at src/app/api/uploadthing/core.ts.

import {
  generateUploadButton,
  generateUploadDropzone,
  generateReactHelpers,
} from '@uploadthing/react';
import type { OurFileRouter } from '@/app/api/uploadthing/core';

export const UploadButton = generateUploadButton<OurFileRouter>();
export const UploadDropzone = generateUploadDropzone<OurFileRouter>();

const { useUploadThing: _useUploadThing } = generateReactHelpers<OurFileRouter>();
export const useUploadThing = _useUploadThing;

// ─── Blob deletion helpers ──────────────────────────────────────────────────
// Blobs are uploaded from several paths but were historically never deleted.
// These helpers let callers reclaim a blob when its DB reference is dropped.

const UT_HOST_SUFFIXES = ['utfs.io', 'ufs.sh', 'uploadthing.com'];

/**
 * Extract the UploadThing file key from a stored URL. Handles both the legacy
 * `https://utfs.io/f/<key>` shape and the newer `.ufsUrl`
 * `https://<appId>.ufs.sh/f/<key>` shape (query strings tolerated). Returns
 * `null` for empty input, unparseable strings, or non-UploadThing hosts (e.g.
 * a raw Instagram/Google source URL in `scraped_vendors.photos`).
 *
 * Pure + unit-tested — the reconciliation script relies on this to map every
 * referenced URL back to a bucket key.
 */
export function extractUtKey(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const isUtHost = UT_HOST_SUFFIXES.some((h) => host === h || host.endsWith(`.${h}`));
  if (!isUtHost) return null;

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  // Keys live at `/f/<key>`; tolerate a legacy `/<key>` shape too.
  const fIdx = segments.indexOf('f');
  const key = fIdx >= 0 ? segments[fIdx + 1] : segments[segments.length - 1];
  return key && key.length > 0 ? key : null;
}

/**
 * Server-side: delete UploadThing blobs given their stored URLs. Extracts +
 * dedupes keys, then calls `UTApi.deleteFiles`. Non-UT / unparseable URLs are
 * skipped. `UTApi` is imported lazily so this module stays client-bundle-safe
 * (client components import `useUploadThing` from here).
 */
export async function deleteUtByUrls(urls: string[]): Promise<{ deleted: number; keys: string[] }> {
  const keys = Array.from(
    new Set((urls ?? []).map(extractUtKey).filter((k): k is string => Boolean(k)))
  );
  if (keys.length === 0) return { deleted: 0, keys: [] };

  const { UTApi } = await import('uploadthing/server');
  const ut = new UTApi();
  await ut.deleteFiles(keys);
  return { deleted: keys.length, keys };
}

/**
 * Client-side best-effort delete: POSTs to the authed delete route so the blob
 * is reclaimed when its reference is dropped in the UI. Never throws and never
 * blocks the UI — a failed reclaim just leaves an orphan for the reconciliation
 * sweep to catch later.
 */
export async function requestUtDelete(urls: string[]): Promise<void> {
  const clean = (urls ?? []).filter((u) => typeof u === 'string' && u.length > 0);
  if (clean.length === 0) return;
  try {
    await fetch('/api/uploadthing/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: clean }),
    });
  } catch (err) {
    console.error('[uploadthing] delete request failed', err);
  }
}
