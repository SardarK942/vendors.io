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

  let query = supabase
    .from('scraped_vendors')
    .select('id, photos')
    .is('claimed_at', null)
    .limit(opts.limit ?? 100);
  if (opts.tagFilter) {
    query = query.contains('tags', [opts.tagFilter]);
  }
  const { data: rows, error } = await query;
  if (error) throw error;
  if (!rows) return result;

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

  return result;
}

if (require.main === module) {
  (async () => {
    const r = await rehostPhotosForUnclaimedRows({
      limit: Number(process.env.K_REHOST_LIMIT ?? 50),
    });
    console.log(
      `rehost-photos: visited=${r.rowsVisited} updated=${r.rowsUpdated} uploaded=${r.photosUploaded} failed=${r.photosFailed}`
    );
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
