import { UTApi } from 'uploadthing/server';
import { createServiceRoleClient } from '../../src/lib/supabase/server';

const EXPIRY_HOST_PATTERNS = [
  /cdninstagram\.com/i,
  /\binstagram\.com\b/i,
  /maps\.googleapis\.com/i,
  /lookaside\.instagram\.com/i,
];

const STABLE_HOST_PATTERNS = [/utfs\.io/i, /uploadthing\.com/i];

/** Returns true if a URL points at a CDN where it could expire (IG, Google photo proxy). */
export function isCdnExpiryRisk(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  if (!url.startsWith('http')) return false;
  if (STABLE_HOST_PATTERNS.some((p) => p.test(url))) return false;
  return EXPIRY_HOST_PATTERNS.some((p) => p.test(url));
}

interface RehostResult {
  rowsVisited: number;
  rowsUpdated: number;
  photosUploaded: number;
  photosFailed: number;
}

interface Options {
  limit?: number;
  tagFilter?: string; // optional tag to scope the run (used by tests)
  sourceFilter?: string; // optional scraped_vendors.source restriction
}

export async function rehostPhotosForUnclaimedRows(opts: Options = {}): Promise<RehostResult> {
  const supabase = await createServiceRoleClient();
  let ut: UTApi | null = null;
  const result: RehostResult = {
    rowsVisited: 0,
    rowsUpdated: 0,
    photosUploaded: 0,
    photosFailed: 0,
  };

  // Supabase PostgREST caps responses at 1000 rows by default — paginate via
  // .range() so a single call can sweep an arbitrarily large unclaimed set.
  // Stable ORDER BY id keeps pages from re-shuffling as rows get updated.
  const PAGE_SIZE = 1000;
  const targetLimit = opts.limit ?? 100;
  let offset = 0;

  while (result.rowsVisited < targetLimit) {
    const remainingBudget = targetLimit - result.rowsVisited;
    const pageSize = Math.min(PAGE_SIZE, remainingBudget);

    let pageQuery = supabase
      .from('scraped_vendors')
      .select('id, photos')
      .is('claimed_at', null)
      .order('id')
      .range(offset, offset + pageSize - 1);
    if (opts.tagFilter) {
      pageQuery = pageQuery.contains('tags', [opts.tagFilter]);
    }
    if (opts.sourceFilter) {
      // sourceFilter is a string env var; Supabase typing wants the literal
      // union of allowed source values, so cast at the call site.
      pageQuery = pageQuery.eq('source', opts.sourceFilter as never);
    }

    const { data: rows, error } = await pageQuery;
    if (error) throw error;
    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      result.rowsVisited += 1;
      const photos = (row.photos ?? []) as string[];
      const expiringUrls = photos.filter(isCdnExpiryRisk);
      if (expiringUrls.length === 0) continue;

      const replacements = new Map<string, string>();
      // Lazy-init UTApi only when there is actual upload work to do.
      if (!ut) ut = new UTApi();
      for (const url of expiringUrls) {
        try {
          const upload = await ut.uploadFilesFromUrl(url);
          if (upload && !Array.isArray(upload) && upload.data?.ufsUrl) {
            replacements.set(url, upload.data.ufsUrl);
            result.photosUploaded += 1;
          } else {
            result.photosFailed += 1;
          }
        } catch {
          result.photosFailed += 1;
        }
      }

      if (replacements.size === 0) continue;

      const newPhotos = photos.map((u) => replacements.get(u) ?? u);
      const { error: updErr } = await supabase
        .from('scraped_vendors')
        .update({ photos: newPhotos })
        .eq('id', row.id);
      if (!updErr) result.rowsUpdated += 1;
    }

    offset += pageSize;
    if (rows.length < pageSize) break; // no more rows to fetch
  }

  return result;
}

if (require.main === module) {
  (async () => {
    const r = await rehostPhotosForUnclaimedRows({
      limit: Number(process.env.K_REHOST_LIMIT ?? 50),
      sourceFilter: process.env.K_REHOST_SOURCE || undefined,
    });
    console.log(
      `rehost-photos: visited=${r.rowsVisited} updated=${r.rowsUpdated} uploaded=${r.photosUploaded} failed=${r.photosFailed}`
    );
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
