import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/admin/csv';

describe('toCsv', () => {
  it('joins headers and rows with newlines', () => {
    const csv = toCsv(
      ['Name', 'Count'],
      [
        ['Alice', 3],
        ['Bob', 5],
      ]
    );
    expect(csv).toBe('Name,Count\nAlice,3\nBob,5');
  });

  it('quotes fields containing commas, quotes, or newlines and doubles inner quotes', () => {
    const csv = toCsv(
      ['Business', 'Note'],
      [
        ['Fries, Inc', 'She said "hi"'],
        ['Line\nBreak', 'ok'],
      ]
    );
    expect(csv).toBe('Business,Note\n"Fries, Inc","She said ""hi"""\n"Line\nBreak",ok');
  });

  it('renders null and undefined as empty cells', () => {
    const csv = toCsv(['A', 'B'], [[null, undefined]]);
    expect(csv).toBe('A,B\n,');
  });

  it('returns just the header row when there are no data rows', () => {
    expect(toCsv(['A', 'B'], [])).toBe('A,B');
  });
});
