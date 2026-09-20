/**
 * Per-category package attribute field definitions (Phase 1, Slices 3 & 4).
 *
 * A pure, side-effect-free lookup that describes the loose, category-specific
 * "what's included" fields a package can carry (stored in the generic
 * package attributes JSON — no dedicated columns, no migration). The editor and
 * display layers read this single source of truth so labels and input types
 * stay consistent per category.
 *
 * Kept intentionally LOOSE per the locked spec: most fields are free `text`,
 * `bool` is only used for yes/no inclusions, and `number` only for true counts.
 * See docs/superpowers/specs/2026-09-17-package-model-locked-decisions.md.
 */

/** How an attribute field is captured in the editor. */
export type AttributeFieldType = 'bool' | 'number' | 'text';

export interface AttributeField {
  /** Snake_case key stored in the package attributes JSON. */
  key: string;
  /** Display label shown in the editor and package display. */
  label: string;
  /** Input type: free text, yes/no boolean, or a numeric count. */
  type: AttributeFieldType;
}

/**
 * Internal per-category attribute table. Categories absent from this map (and
 * bridal_wear, intentionally deferred) resolve to an empty list.
 */
const CATEGORY_ATTRIBUTES: Record<string, readonly AttributeField[]> = {
  photography: [
    { key: 'photographers', label: '# of photographers', type: 'number' },
    { key: 'edited_photos', label: 'Edited photos', type: 'text' },
    { key: 'raw_files', label: 'Raw files included', type: 'bool' },
    { key: 'online_gallery', label: 'Online gallery', type: 'bool' },
    { key: 'album', label: 'Album included', type: 'bool' },
    { key: 'turnaround', label: 'Turnaround', type: 'text' },
  ],
  videography: [
    { key: 'videographers', label: '# of videographers', type: 'number' },
    { key: 'highlight_film', label: 'Highlight film', type: 'text' },
    { key: 'full_ceremony_edit', label: 'Full ceremony edit', type: 'bool' },
    { key: 'raw_footage', label: 'Raw footage', type: 'bool' },
    { key: 'drone', label: 'Drone', type: 'bool' },
    { key: 'live_stream', label: 'Live stream', type: 'bool' },
    { key: 'turnaround', label: 'Turnaround', type: 'text' },
  ],
  content_creation: [
    { key: 'num_reels', label: '# of reels', type: 'text' },
    { key: 'turnaround', label: 'Turnaround', type: 'text' },
    { key: 'platforms', label: 'Platforms', type: 'text' },
    { key: 'raw_clips', label: 'Raw clips', type: 'bool' },
  ],
  dj: [
    { key: 'equipment_included', label: 'Equipment included', type: 'text' },
    { key: 'mc_included', label: 'MC included', type: 'bool' },
    { key: 'genres', label: 'Genres / languages', type: 'text' },
  ],
  photobooth: [
    { key: 'unlimited_prints', label: 'Unlimited prints', type: 'bool' },
    { key: 'digital_copies', label: 'Digital copies', type: 'bool' },
    { key: 'attendant_included', label: 'Attendant included', type: 'bool' },
    { key: 'custom_backdrop', label: 'Custom backdrop', type: 'text' },
    { key: 'props', label: 'Props included', type: 'bool' },
  ],
  live_music: [
    { key: 'ensemble', label: 'Ensemble', type: 'text' },
    { key: 'num_performers', label: '# of performers', type: 'number' },
    { key: 'sound_included', label: 'Sound/PA included', type: 'bool' },
    { key: 'genres', label: 'Genres', type: 'text' },
  ],
  catering: [
    { key: 'menu', label: 'Menu', type: 'text' },
    { key: 'staff_included', label: 'Staff included', type: 'bool' },
    { key: 'rentals_included', label: 'Rentals included', type: 'text' },
    { key: 'tasting_included', label: 'Tasting included', type: 'bool' },
  ],
  hair_makeup: [
    { key: 'trial_included', label: 'Trial included', type: 'bool' },
    { key: 'on_location', label: 'On location', type: 'bool' },
  ],
  carts: [
    { key: 'attendant_included', label: 'Attendant included', type: 'bool' },
    { key: 'menu_flavors', label: 'Menu / flavors', type: 'text' },
    { key: 'setup_included', label: 'Setup included', type: 'bool' },
  ],
  venue: [
    { key: 'rental_basis', label: 'Rental basis', type: 'text' },
    { key: 'in_house_catering', label: 'In-house catering', type: 'text' },
    { key: 'inclusions', label: 'Inclusions', type: 'text' },
  ],
  decor: [
    { key: 'style', label: 'Style', type: 'text' },
    { key: 'inclusions', label: 'Inclusions', type: 'text' },
  ],
  invitations: [
    { key: 'design_type', label: 'Design type', type: 'text' },
    { key: 'suite_includes', label: 'Suite includes', type: 'text' },
    { key: 'print_options', label: 'Print options', type: 'text' },
    { key: 'proofs_revisions', label: 'Proofs / revisions', type: 'text' },
    { key: 'turnaround', label: 'Turnaround', type: 'text' },
  ],
  gifts: [
    { key: 'personalization', label: 'Personalization', type: 'text' },
    { key: 'contents', label: 'Contents', type: 'text' },
    { key: 'setup_included', label: 'Setup included', type: 'bool' },
  ],
  mehndi: [
    { key: 'coverage', label: 'Coverage / design', type: 'text' },
    { key: 'num_artists', label: '# of artists', type: 'number' },
    { key: 'style', label: 'Style', type: 'text' },
  ],
  // bridal_wear: deferred — no attribute fields yet.
};

/**
 * The loose, category-specific package attribute fields. Unknown categories
 * (and bridal_wear, deferred) return an empty array.
 */
export function getPackageAttributes(category: string): AttributeField[] {
  const fields = CATEGORY_ATTRIBUTES[category];
  return fields ? [...fields] : [];
}
