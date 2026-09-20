/**
 * Category-aware "What you're looking for" fields for the couple-side custom /
 * quote request (Phase 1, Slice 3).
 *
 * A pure, side-effect-free bridge between the package-model foundations and the
 * custom-request form. It surfaces ONLY the couple-answerable quantity fields
 * (how many guests / how long) derived from the shared package field config
 * (`getPackageFieldConfig`) — never the VENDOR's "what's included" attribute
 * wishlist (Menu, Staff included, Raw files, …), which a couple can't answer.
 * Each field carries a friendly, couple-facing label + helper text rather than
 * the vendor-facing label. The vendor then quotes against whatever the couple
 * chose to share.
 *
 * Phase 1 = NO schema change and NO pricing math: the couple's answers are
 * serialized into a human-readable text block that is appended to the existing
 * free-text request message (see `composeRequestedDetailsText`).
 */

import { getPackageFieldConfig } from '@/lib/packages/archetypes';
import type { AttributeFieldType } from '@/lib/packages/attributes';

/** A single optional quantity input rendered in the custom-request form. */
export interface RequestedDetailField {
  /** Stable key used in the couple's answer map. */
  key: string;
  /** Friendly, couple-facing display label (not the vendor label). */
  label: string;
  /** Muted helper copy shown under the input to guide the couple. */
  helperText: string;
  /** Input type. Couple-facing quantity fields are always numeric. */
  type: AttributeFieldType;
}

/**
 * Categories whose capacity is genuinely a head-count of attending guests.
 * Everything else with a non-hidden capacity field (e.g. gifts, priced by the
 * piece) is framed to the couple as a plain "Quantity needed". Note: carts
 * capacity is 'servings' in the vendor editor, but for the couple it's still
 * "how many guests will you be feeding", so it lives here.
 */
const GUEST_CAPACITY_CATEGORIES = new Set(['catering', 'carts', 'venue']);

/**
 * The optional, couple-answerable quantity fields to show a couple: the
 * non-hidden capacity field (framed as guest count vs quantity by category) and
 * the non-hidden duration field. Categories where both are hidden (and unknown
 * categories via the default config) yield the guest/quantity-free set, so the
 * form's "What you're looking for" section is simply hidden.
 */
export function getRequestedDetailFields(category: string): RequestedDetailField[] {
  const cfg = getPackageFieldConfig(category);
  const fields: RequestedDetailField[] = [];

  if (cfg.maxGuests !== 'hidden') {
    const isGuests = GUEST_CAPACITY_CATEGORIES.has(category);
    fields.push({
      key: 'maxGuests',
      label: isGuests ? 'Guest count' : 'Quantity needed',
      helperText: isGuests
        ? 'Roughly how many guests will be attending?'
        : 'Roughly how many do you need?',
      type: 'number',
    });
  }
  if (cfg.durationHours !== 'hidden') {
    fields.push({
      key: 'durationHours',
      label: 'Hours needed',
      helperText: 'Roughly how long do you need them for?',
      type: 'number',
    });
  }

  return fields;
}

/** The couple's raw answers, keyed by RequestedDetailField.key. */
export type RequestedDetailValues = Record<string, string>;

/**
 * Serialize only the fields the couple actually filled into a tidy,
 * human-readable block. Booleans are stored as `'yes'` when checked and are
 * omitted otherwise; empty/whitespace text and numbers are skipped. Returns an
 * empty string when nothing was filled (caller then appends nothing).
 */
export function composeRequestedDetailsText(
  category: string,
  values: RequestedDetailValues
): string {
  const lines: string[] = [];

  for (const field of getRequestedDetailFields(category)) {
    const raw = values[field.key];
    if (raw == null) continue;
    const value = raw.trim();
    if (!value) continue;

    if (field.type === 'bool') {
      if (value !== 'yes') continue;
      lines.push(`${field.label}: yes`);
    } else {
      lines.push(`${field.label}: ${value}`);
    }
  }

  if (lines.length === 0) return '';
  return `Requested details —\n${lines.join('\n')}`;
}
