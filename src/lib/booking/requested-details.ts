/**
 * Category-aware "What you're looking for" fields for the couple-side custom /
 * quote request (Phase 1, Slice 3).
 *
 * A pure, side-effect-free bridge between the package-model foundations and the
 * custom-request form. It mirrors the per-category fields a VENDOR fills when
 * creating a package (`getPackageFieldConfig` + `getPackageAttributes`) but
 * surfaces them to the COUPLE as an all-optional wishlist. The vendor then
 * quotes against whatever the couple chose to share.
 *
 * Phase 1 = NO schema change and NO pricing math: the couple's answers are
 * serialized into a human-readable text block that is appended to the existing
 * free-text request message (see `composeRequestedDetailsText`).
 */

import { getPackageFieldConfig } from '@/lib/packages/archetypes';
import { getPackageAttributes } from '@/lib/packages/attributes';
import type { AttributeFieldType } from '@/lib/packages/attributes';

/** A single optional wishlist input rendered in the custom-request form. */
export interface RequestedDetailField {
  /** Stable key used in the couple's answer map. */
  key: string;
  /** Display label (reused from the package-model config so it stays in sync). */
  label: string;
  /** Input type: yes/no boolean, numeric count, or free text. */
  type: AttributeFieldType;
}

/**
 * The optional, category-specific fields to show a couple. Composed from the
 * non-hidden capacity/duration fields plus the category's attribute wishlist.
 * Unknown categories (and bridal_wear) yield an empty list, so the form's
 * "What you're looking for" section is simply hidden.
 */
export function getRequestedDetailFields(category: string): RequestedDetailField[] {
  const cfg = getPackageFieldConfig(category);
  const fields: RequestedDetailField[] = [];

  if (cfg.maxGuests !== 'hidden') {
    fields.push({ key: 'maxGuests', label: cfg.maxGuestsLabel, type: 'number' });
  }
  if (cfg.durationHours !== 'hidden') {
    fields.push({ key: 'durationHours', label: cfg.durationHoursLabel, type: 'number' });
  }
  for (const attr of getPackageAttributes(category)) {
    fields.push({ key: attr.key, label: attr.label, type: attr.type });
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
