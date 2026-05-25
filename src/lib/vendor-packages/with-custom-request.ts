/**
 * Virtual "Custom Request" package shape. Mirrors the columns fetched in
 * src/app/(marketplace)/vendors/[slug]/page.tsx so PackageGrid can iterate
 * a mixed list without type narrowing pain. All sizing/pricing fields are
 * null to signal "no fixed package" — PackageGrid branches on `is_custom`
 * to render Treatment B.
 */
export interface CustomRequestPackage {
  id: 'custom-request';
  name: 'Custom Request';
  description: string;
  base_price_cents: null;
  included_items: null;
  max_guests: null;
  duration_hours: null;
  events_count: null;
  featured_image_url: null;
  gallery_image_urls: null;
  vendor_notes_template: null;
  location_mode: null;
  addons: [];
  is_custom: true;
}

const CUSTOM_REQUEST_DESCRIPTION =
  'Multi-day events, large guest counts, destination weddings, anything outside our standard packages. Tell us what you need.';

/**
 * Returns the package list with a virtual Custom Request entry appended.
 * Defensive: never double-appends. `vendorProfileId` is currently unused
 * but kept on the signature for future per-vendor customization hooks.
 */
export function appendCustomRequest<T extends { id: string }>(
  packages: T[],
  _vendorProfileId: string
): (T | CustomRequestPackage)[] {
  if (packages.some((p) => p.id === 'custom-request')) return packages;

  const customEntry: CustomRequestPackage = {
    id: 'custom-request',
    name: 'Custom Request',
    description: CUSTOM_REQUEST_DESCRIPTION,
    base_price_cents: null,
    included_items: null,
    max_guests: null,
    duration_hours: null,
    events_count: null,
    featured_image_url: null,
    gallery_image_urls: null,
    vendor_notes_template: null,
    location_mode: null,
    addons: [],
    is_custom: true,
  };

  return [...packages, customEntry];
}
