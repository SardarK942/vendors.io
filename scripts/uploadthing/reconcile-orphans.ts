/**
 * One-off UploadThing orphan reconciliation.
 *
 * Blobs are uploaded from several paths but were historically never deleted, so
 * the bucket accumulates orphans — blobs no longer referenced by any DB row
 * (e.g. the scraper test batch). This script builds the referenced-key set from
 * every column that stores a UT URL, lists the bucket, and diffs them.
 *
 * ── HOW TO RUN ───────────────────────────────────────────────────────────────
 *   # DRY RUN (default) — prints the orphan report, deletes NOTHING:
 *   npx tsx scripts/uploadthing/reconcile-orphans.ts
 *
 *   # DELETE — only after a human has reviewed the dry-run report:
 *   npx tsx scripts/uploadthing/reconcile-orphans.ts --delete
 *
 * Requires UPLOADTHING_TOKEN (or UPLOADTHING_SECRET), NEXT_PUBLIC_SUPABASE_URL,
 * and SUPABASE_SERVICE_ROLE_KEY in the environment.
 *
 * ── SAFETY ───────────────────────────────────────────────────────────────────
 * Dry run is the DEFAULT. Deletion happens ONLY with an explicit `--delete`.
 * A HUMAN MUST REVIEW the dry-run report before ever passing `--delete`.
 * Guards (see assertSafeToReconcile / computeOrphans):
 *   - Abort without deleting if the referenced set is empty or any reference
 *     query errored (the empty-reference footgun would wipe the whole bucket).
 *   - Skip candidates whose upload time is < 24h old (in-flight onboarding
 *     uploads that may not be saved to a row yet).
 *   - Deletes are batched.
 */

import { UTApi } from 'uploadthing/server';
import { createServiceRoleClient } from '../../src/lib/supabase/server';
import { extractUtKey } from '../../src/lib/uploadthing';
import { STABLE_HOST_PATTERNS } from '../scraper/rehost-photos';

const RECENT_UPLOAD_GRACE_MS = 24 * 60 * 60 * 1000; // 24h
const DELETE_BATCH_SIZE = 250;
const PAGE_SIZE = 1000;

// ─── Pure diff logic (unit-tested) ───────────────────────────────────────────

export interface BucketFile {
  key: string;
  /** Unix epoch milliseconds, from UTApi.listFiles(). */
  uploadedAtMs: number;
}

export interface OrphanDiffInput {
  /** Keys referenced by at least one DB row. */
  referencedKeys: Set<string>;
  /** Every key currently in the bucket. */
  bucketFiles: BucketFile[];
  /** Reference clock (Date.now()). */
  nowMs: number;
  /** Skip candidates younger than this (default 24h). */
  minAgeMs?: number;
}

export interface OrphanDiffResult {
  orphanKeys: string[];
  /** Unreferenced but too-young-to-delete keys, surfaced for the report. */
  skippedRecentKeys: string[];
  referencedCount: number;
  bucketCount: number;
}

/**
 * SAFETY GUARD — throws (aborting the run) if it is unsafe to compute orphans.
 * An empty referenced set combined with a populated bucket means "delete
 * everything", which is almost always a bug (a failed/empty reference query),
 * so we refuse rather than wipe the bucket. `hadReferenceError` is set by the
 * caller when any reference query errored.
 */
export function assertSafeToReconcile(
  referencedKeys: Set<string>,
  bucketFiles: BucketFile[],
  hadReferenceError: boolean
): void {
  if (hadReferenceError) {
    throw new Error(
      'Aborting: at least one reference query errored — refusing to diff against a partial reference set.'
    );
  }
  if (referencedKeys.size === 0 && bucketFiles.length > 0) {
    throw new Error(
      'Aborting: referenced-key set is empty while the bucket is not — this would delete every blob. ' +
        'Check the reference queries before proceeding.'
    );
  }
}

/**
 * Diff the bucket against the referenced set. Orphans = bucket keys not
 * referenced AND older than the grace window. Younger unreferenced keys are
 * reported separately (likely in-flight uploads). Pure — no I/O.
 */
export function computeOrphans(input: OrphanDiffInput): OrphanDiffResult {
  const minAgeMs = input.minAgeMs ?? RECENT_UPLOAD_GRACE_MS;
  const orphanKeys: string[] = [];
  const skippedRecentKeys: string[] = [];

  for (const file of input.bucketFiles) {
    if (input.referencedKeys.has(file.key)) continue;
    const ageMs = input.nowMs - file.uploadedAtMs;
    if (ageMs < minAgeMs) {
      skippedRecentKeys.push(file.key);
    } else {
      orphanKeys.push(file.key);
    }
  }

  return {
    orphanKeys,
    skippedRecentKeys,
    referencedCount: input.referencedKeys.size,
    bucketCount: input.bucketFiles.length,
  };
}

function isUtHost(url: string): boolean {
  return typeof url === 'string' && STABLE_HOST_PATTERNS.some((p) => p.test(url));
}

// ─── Reference-set builder (I/O) ─────────────────────────────────────────────

interface ReferenceResult {
  referencedKeys: Set<string>;
  hadError: boolean;
}

type ServiceRoleClient = Awaited<ReturnType<typeof createServiceRoleClient>>;

/** Add every extractable UT key from a URL list into the set. */
function collectKeys(urls: unknown, into: Set<string>, utHostOnly = false): void {
  if (!Array.isArray(urls)) return;
  for (const url of urls) {
    if (typeof url !== 'string') continue;
    if (utHostOnly && !isUtHost(url)) continue;
    const key = extractUtKey(url);
    if (key) into.add(key);
  }
}

/**
 * Build the referenced-key set from every column that stores a UT URL:
 *   - vendor_profiles.portfolio_images  (text[])
 *   - packages.featured_image_url + packages.gallery_image_urls (text, jsonb)
 *   - scraped_vendors.photos            (text[], mixed sources → filter to UT)
 * Any query error flips hadError so the caller aborts (never partial-deletes).
 */
async function buildReferencedKeys(supabase: ServiceRoleClient): Promise<ReferenceResult> {
  const referencedKeys = new Set<string>();
  let hadError = false;

  // vendor_profiles.portfolio_images
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('vendor_profiles')
      .select('portfolio_images')
      .order('id')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.error('[reconcile] vendor_profiles query failed:', error.message);
      hadError = true;
      break;
    }
    if (!data || data.length === 0) break;
    for (const row of data) collectKeys(row.portfolio_images, referencedKeys);
    if (data.length < PAGE_SIZE) break;
  }

  // packages.featured_image_url + gallery_image_urls
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('packages')
      .select('featured_image_url, gallery_image_urls')
      .order('id')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.error('[reconcile] packages query failed:', error.message);
      hadError = true;
      break;
    }
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.featured_image_url) {
        const key = extractUtKey(row.featured_image_url);
        if (key) referencedKeys.add(key);
      }
      collectKeys(row.gallery_image_urls, referencedKeys);
    }
    if (data.length < PAGE_SIZE) break;
  }

  // scraped_vendors.photos — mixed source + rehosted URLs; keep only UT hosts.
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('scraped_vendors')
      .select('photos')
      .order('id')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.error('[reconcile] scraped_vendors query failed:', error.message);
      hadError = true;
      break;
    }
    if (!data || data.length === 0) break;
    for (const row of data) collectKeys(row.photos, referencedKeys, true);
    if (data.length < PAGE_SIZE) break;
  }

  return { referencedKeys, hadError };
}

/** List the whole bucket, paginating until hasMore is false. */
async function listAllBucketFiles(ut: UTApi): Promise<BucketFile[]> {
  const files: BucketFile[] = [];
  let offset = 0;
  const limit = 500;
  for (;;) {
    const page = await ut.listFiles({ limit, offset });
    for (const f of page.files) {
      files.push({ key: f.key, uploadedAtMs: f.uploadedAt });
    }
    if (!page.hasMore || page.files.length === 0) break;
    offset += page.files.length;
  }
  return files;
}

// ─── Runner ──────────────────────────────────────────────────────────────────

export async function reconcileOrphans(shouldDelete: boolean): Promise<void> {
  const supabase = await createServiceRoleClient();
  const ut = new UTApi();

  console.log('[reconcile] building referenced-key set from the database…');
  const { referencedKeys, hadError } = await buildReferencedKeys(supabase);

  console.log('[reconcile] listing the UploadThing bucket…');
  const bucketFiles = await listAllBucketFiles(ut);

  // SAFETY: refuse to proceed on an empty reference set or a reference-query error.
  assertSafeToReconcile(referencedKeys, bucketFiles, hadError);

  const diff = computeOrphans({ referencedKeys, bucketFiles, nowMs: Date.now() });

  console.log('');
  console.log('──────── UploadThing reconciliation report ────────');
  console.log(`Referenced keys (DB):     ${diff.referencedCount}`);
  console.log(`Bucket files (UT):        ${diff.bucketCount}`);
  console.log(`Orphan candidates:        ${diff.orphanKeys.length}`);
  console.log(`Skipped (< 24h old):      ${diff.skippedRecentKeys.length}`);
  console.log('───────────────────────────────────────────────────');
  if (diff.orphanKeys.length > 0) {
    console.log('Orphan keys:');
    for (const key of diff.orphanKeys) console.log(`  ${key}`);
  }
  console.log('');

  if (!shouldDelete) {
    console.log('DRY RUN — nothing deleted. Review the list above, then re-run with --delete.');
    return;
  }

  if (diff.orphanKeys.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  console.log(`--delete passed — deleting ${diff.orphanKeys.length} orphan blobs in batches…`);
  let deleted = 0;
  for (let i = 0; i < diff.orphanKeys.length; i += DELETE_BATCH_SIZE) {
    const batch = diff.orphanKeys.slice(i, i + DELETE_BATCH_SIZE);
    await ut.deleteFiles(batch);
    deleted += batch.length;
    console.log(`  deleted ${deleted}/${diff.orphanKeys.length}`);
  }
  console.log(`Done — deleted ${deleted} orphan blobs.`);
}

if (require.main === module) {
  const shouldDelete = process.argv.includes('--delete');
  reconcileOrphans(shouldDelete).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
