import { describe, expect, it } from 'vitest';
import {
  assertSafeToReconcile,
  computeOrphans,
  type BucketFile,
} from '../../../../scripts/uploadthing/reconcile-orphans';

const HOUR = 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

function file(key: string, ageHours: number): BucketFile {
  return { key, uploadedAtMs: NOW - ageHours * HOUR };
}

describe('computeOrphans', () => {
  it('flags bucket keys not referenced (older than the grace window)', () => {
    const result = computeOrphans({
      referencedKeys: new Set(['keep-1', 'keep-2']),
      bucketFiles: [file('keep-1', 100), file('orphan-1', 100), file('orphan-2', 100)],
      nowMs: NOW,
    });
    expect(result.orphanKeys.sort()).toEqual(['orphan-1', 'orphan-2']);
    expect(result.referencedCount).toBe(2);
    expect(result.bucketCount).toBe(3);
  });

  it('keeps referenced keys even when they are old', () => {
    const result = computeOrphans({
      referencedKeys: new Set(['keep-1']),
      bucketFiles: [file('keep-1', 9999)],
      nowMs: NOW,
    });
    expect(result.orphanKeys).toEqual([]);
  });

  it('skips unreferenced keys younger than 24h (in-flight uploads)', () => {
    const result = computeOrphans({
      referencedKeys: new Set(['keep-1']),
      bucketFiles: [file('fresh', 2), file('old-orphan', 48)],
      nowMs: NOW,
    });
    expect(result.orphanKeys).toEqual(['old-orphan']);
    expect(result.skippedRecentKeys).toEqual(['fresh']);
  });

  it('honours a custom minAgeMs', () => {
    const result = computeOrphans({
      referencedKeys: new Set<string>(['x']),
      bucketFiles: [file('a', 2)],
      nowMs: NOW,
      minAgeMs: 1 * HOUR,
    });
    // 'a' is 2h old, older than the 1h grace → orphan.
    expect(result.orphanKeys).toEqual(['a']);
  });

  it('returns no orphans when everything is referenced', () => {
    const result = computeOrphans({
      referencedKeys: new Set(['a', 'b']),
      bucketFiles: [file('a', 100), file('b', 100)],
      nowMs: NOW,
    });
    expect(result.orphanKeys).toEqual([]);
    expect(result.skippedRecentKeys).toEqual([]);
  });
});

describe('assertSafeToReconcile (empty-reference / error abort guard)', () => {
  it('throws when the referenced set is empty but the bucket is not', () => {
    expect(() => assertSafeToReconcile(new Set<string>(), [file('anything', 100)], false)).toThrow(
      /referenced-key set is empty/i
    );
  });

  it('throws when a reference query errored', () => {
    expect(() => assertSafeToReconcile(new Set(['keep']), [file('a', 100)], true)).toThrow(
      /reference query errored/i
    );
  });

  it('does not throw when the referenced set is non-empty and no error', () => {
    expect(() => assertSafeToReconcile(new Set(['keep']), [file('a', 100)], false)).not.toThrow();
  });

  it('does not throw on an empty bucket even with an empty reference set', () => {
    // Nothing in the bucket → nothing to wrongly delete.
    expect(() => assertSafeToReconcile(new Set<string>(), [], false)).not.toThrow();
  });
});
