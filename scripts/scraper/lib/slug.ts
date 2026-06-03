/** Generate a unique, URL-safe slug for a scraped_vendors row.
 *  Mirrors the SQL backfill from migration 00051: lowercased + dashed business
 *  name, special chars collapsed, leading/trailing dashes trimmed, suffixed
 *  with the first 6 hex chars of the (UUID minus dashes). */
export function generateScrapedVendorSlug(businessName: string, vendorUuid: string): string {
  const cleaned = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const suffix = vendorUuid.replace(/-/g, '').slice(0, 6).toLowerCase();
  return cleaned ? `${cleaned}-${suffix}` : suffix;
}
