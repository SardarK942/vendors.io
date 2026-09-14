import { describe, it, expect } from 'vitest';
import { partitionSelectedFiles, selectionWarning, uploadErrorMessage } from '@/lib/photo-upload';

// Minimal File stub — jsdom File works, but this keeps the test env-agnostic.
function file(name: string, sizeMb: number): File {
  const bytes = Math.round(sizeMb * 1024 * 1024);
  // Construct a File whose .size reports the intended byte length without
  // allocating the buffer (large sizes would be wasteful).
  const f = new File([], name, { type: 'image/jpeg' });
  Object.defineProperty(f, 'size', { value: bytes });
  return f;
}

describe('partitionSelectedFiles', () => {
  it('accepts files within the size limit and the remaining slots', () => {
    const files = [file('a.jpg', 2), file('b.jpg', 3)];
    const r = partitionSelectedFiles(files, { remainingSlots: 10, maxSizeMb: 16 });
    expect(r.accepted).toHaveLength(2);
    expect(r.tooLarge).toHaveLength(0);
    expect(r.overflow).toBe(0);
  });

  it('rejects files over the size limit (the iPhone oversize case)', () => {
    const files = [file('small.jpg', 3), file('huge.jpg', 20)];
    const r = partitionSelectedFiles(files, { remainingSlots: 10, maxSizeMb: 16 });
    expect(r.accepted.map((f) => f.name)).toEqual(['small.jpg']);
    expect(r.tooLarge.map((f) => f.name)).toEqual(['huge.jpg']);
  });

  it('does not let an oversized file consume a slot (size filtered before slot cap)', () => {
    // 1 slot left; first file is oversized — the second, valid file should get the slot.
    const files = [file('huge.jpg', 20), file('ok.jpg', 2)];
    const r = partitionSelectedFiles(files, { remainingSlots: 1, maxSizeMb: 16 });
    expect(r.accepted.map((f) => f.name)).toEqual(['ok.jpg']);
    expect(r.tooLarge.map((f) => f.name)).toEqual(['huge.jpg']);
    expect(r.overflow).toBe(0);
  });

  it('counts overflow when more valid files are picked than slots remain', () => {
    const files = [file('a.jpg', 1), file('b.jpg', 1), file('c.jpg', 1)];
    const r = partitionSelectedFiles(files, { remainingSlots: 2, maxSizeMb: 16 });
    expect(r.accepted).toHaveLength(2);
    expect(r.overflow).toBe(1);
  });

  it('treats zero or negative remaining slots as full', () => {
    const r = partitionSelectedFiles([file('a.jpg', 1)], { remainingSlots: 0, maxSizeMb: 16 });
    expect(r.accepted).toHaveLength(0);
    expect(r.overflow).toBe(1);
  });
});

describe('selectionWarning', () => {
  it('returns null when nothing was skipped', () => {
    const w = selectionWarning({ accepted: [file('a.jpg', 1)], tooLarge: [], overflow: 0 }, 16);
    expect(w).toBeNull();
  });

  it('names the oversized-file count and the limit', () => {
    const w = selectionWarning(
      { accepted: [], tooLarge: [file('h1.jpg', 20), file('h2.jpg', 20)], overflow: 0 },
      16
    );
    expect(w).toMatch(/2 photos/);
    expect(w).toMatch(/16MB/);
  });

  it('mentions overflow when photos did not fit remaining slots', () => {
    const w = selectionWarning({ accepted: [file('a.jpg', 1)], tooLarge: [], overflow: 3 }, 16);
    expect(w).toMatch(/3 photos/);
  });
});

describe('uploadErrorMessage', () => {
  it('gives a size-specific hint for size errors', () => {
    expect(uploadErrorMessage({ message: 'FileSizeMismatch: file too large' })).toMatch(
      /too large/i
    );
  });

  it('falls back to a generic message otherwise', () => {
    expect(uploadErrorMessage({ message: 'network glitch' })).toMatch(/couldn.t be uploaded/i);
    expect(uploadErrorMessage(null)).toMatch(/couldn.t be uploaded/i);
  });
});
