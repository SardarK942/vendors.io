export type CartLine = {
  variantId: string;
  unitPriceCents: number;
  quantity: number;
  stockQuantity: number;
  isMadeToMeasure: boolean;
  measurementResolved: boolean;
};

export type BoutiqueSummary = {
  subtotalCents: number;
  outOfStockVariantIds: string[];
  unresolvedMtmVariantIds: string[];
};

/**
 * Pure cart pricing + readiness summary. All amounts are integer cents.
 * MTM (made-to-measure) lines are made to order, so they ignore stock.
 */
export function computeBoutiqueSummary(lines: CartLine[]): BoutiqueSummary {
  let subtotalCents = 0;
  const outOfStockVariantIds: string[] = [];
  const unresolvedMtmVariantIds: string[] = [];

  for (const line of lines) {
    subtotalCents += line.unitPriceCents * line.quantity;

    if (line.isMadeToMeasure) {
      if (!line.measurementResolved) {
        unresolvedMtmVariantIds.push(line.variantId);
      }
    } else if (line.quantity > line.stockQuantity) {
      outOfStockVariantIds.push(line.variantId);
    }
  }

  return { subtotalCents, outOfStockVariantIds, unresolvedMtmVariantIds };
}

/** Checkout is allowed only when no line is out of stock or has unresolved measurements. */
export function isReadyToCheckout(summary: BoutiqueSummary): boolean {
  return summary.outOfStockVariantIds.length === 0 && summary.unresolvedMtmVariantIds.length === 0;
}
