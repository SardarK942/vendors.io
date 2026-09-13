import type { Database } from '@/types/database.types';
import { getPublishBlockers } from '@/lib/onboarding/publish-checklist';

type VendorRow = Database['public']['Tables']['vendor_profiles']['Row'];

/**
 * Number of publish-gate fields getPublishBlockers() can flag. Kept next to the
 * completeness math so the percentage stays honest if the gate ever changes.
 */
export const TOTAL_GATE_FIELDS = 8;

const DAY_MS = 86_400_000;

export interface UnfinishedRow {
  profileId: string;
  businessName: string;
  email: string;
  createdAt: string | null;
  /** Days since the profile was last touched (updated_at, else created_at). */
  daysStalled: number;
  /** Publish-gate field names still missing (from getPublishBlockers). */
  missingFields: string[];
  missingCount: number;
  /** Percentage of gate fields satisfied, 0–100. */
  completeness: number;
}

/**
 * Flatten a vendor profile + its owner email into the row the admin table and
 * CSV export render. Missing-field logic is delegated to getPublishBlockers so
 * the portal, the publish endpoint, and the onboarding checklist never diverge.
 */
export function buildUnfinishedRow(
  profile: VendorRow,
  email: string,
  nowMs: number
): UnfinishedRow {
  const missingFields = getPublishBlockers(profile).map((b) => b.field);
  const missingCount = missingFields.length;
  const satisfied = Math.max(0, TOTAL_GATE_FIELDS - missingCount);

  const lastTouched = profile.updated_at ?? profile.created_at;
  const daysStalled = lastTouched ? Math.floor((nowMs - Date.parse(lastTouched)) / DAY_MS) : 0;

  return {
    profileId: profile.id,
    businessName: profile.business_name ?? '',
    email,
    createdAt: profile.created_at,
    daysStalled,
    missingFields,
    missingCount,
    completeness: Math.round((satisfied / TOTAL_GATE_FIELDS) * 100),
  };
}

/** Deduped, comma-joined email list for the "Copy emails" action. */
export function emailList(rows: { email: string }[]): string {
  return Array.from(new Set(rows.map((r) => r.email).filter(Boolean))).join(', ');
}
