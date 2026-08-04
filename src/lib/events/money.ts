/** Parse a dollars input string to integer cents. '' → null; invalid → undefined. */
export function dollarsToCents(input: string): number | null | undefined {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
}
