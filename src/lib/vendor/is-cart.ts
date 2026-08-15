/**
 * A vendor is a "cart" vendor when carts are their primary category, or (under
 * the multi-service model, PR #123) one of the services they offer. Cart
 * vendors — beverage/dessert/appetizer carts — price by servings poured rather
 * than headcount, so they get the guests-vs-servings capacity-unit selector in
 * the package editor. Every other vendor stays on 'guests'.
 */
export function isCartVendor(
  category: string | null | undefined,
  services: string[] | null | undefined
): boolean {
  return category === 'carts' || (services ?? []).includes('carts');
}
