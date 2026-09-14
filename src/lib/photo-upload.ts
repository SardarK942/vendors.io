/**
 * Client-side pre-flight for a photo selection, shared by both views of
 * PhotoUploaderDrawer.
 *
 * Why this exists: iPhone photos (48MP, or HEIC transcoded to JPEG by iOS on
 * pick) frequently exceed the per-file size limit. UploadThing uploads a
 * selection as one parallel batch, so a single oversized file makes the whole
 * batch reject — and the failure was previously silent, so users saw nothing
 * ("selected multiple photos, none showed up"). Filtering oversized files out
 * here — with a visible warning — keeps the valid photos uploading and tells
 * the user exactly what was skipped.
 */

export interface PartitionedFiles {
  /** Files that pass the size check and fit the remaining slots — these upload. */
  accepted: File[];
  /** Files rejected for exceeding the per-file size limit. */
  tooLarge: File[];
  /** Count of otherwise-valid files dropped for exceeding the remaining slots. */
  overflow: number;
}

export function partitionSelectedFiles(
  files: File[],
  opts: { remainingSlots: number; maxSizeMb: number }
): PartitionedFiles {
  const maxBytes = opts.maxSizeMb * 1024 * 1024;

  // Split on size FIRST, so an oversized file never consumes a remaining slot
  // that a valid file could have used.
  const withinSize: File[] = [];
  const tooLarge: File[] = [];
  for (const f of files) {
    if (f.size > maxBytes) tooLarge.push(f);
    else withinSize.push(f);
  }

  const remaining = Math.max(0, opts.remainingSlots);
  const accepted = withinSize.slice(0, remaining);
  const overflow = withinSize.length - accepted.length;

  return { accepted, tooLarge, overflow };
}

function plural(n: number): string {
  return n === 1 ? '' : 's';
}

/**
 * Human-readable message for anything the pre-flight skipped, or null when the
 * whole selection was accepted.
 */
export function selectionWarning(p: PartitionedFiles, maxSizeMb: number): string | null {
  const parts: string[] = [];

  if (p.tooLarge.length > 0) {
    const n = p.tooLarge.length;
    parts.push(`${n} photo${plural(n)} over ${maxSizeMb}MB ${n === 1 ? 'was' : 'were'} skipped`);
  }
  if (p.overflow > 0) {
    const n = p.overflow;
    parts.push(`${n} photo${plural(n)} didn't fit the remaining slots`);
  }

  return parts.length > 0 ? `${parts.join('. ')}.` : null;
}

/**
 * Friendly message for a failed upload. Previously failures were only
 * console.error'd, so users saw nothing — this makes the batch failure visible.
 */
export function uploadErrorMessage(err?: { message?: string } | null): string {
  const raw = err?.message ?? '';
  if (/file ?size|too large|maxFileSize|FileSizeMismatch|exceeded/i.test(raw)) {
    return 'Some photos are too large to upload. Please choose smaller photos and try again.';
  }
  return 'Some photos couldn’t be uploaded. Please try again.';
}
