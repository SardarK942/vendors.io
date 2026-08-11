import type { Database } from '@/types/database.types';

type VendorRow = Database['public']['Tables']['vendor_profiles']['Row'];

export type PublishBlockerStep = 'basics' | 'online' | 'portfolio' | 'details';

export interface PublishBlocker {
  field: string;
  /** Action-phrased label shown in the "finish these to publish" checklist. */
  label: string;
  /** Wizard step the vendor edits to resolve it. */
  step: PublishBlockerStep;
}

const INSTAGRAM_RE = /^[A-Za-z0-9._]{1,30}$/;
const VALID_SLA_HOURS = [1, 4, 24, 48, 72];

/**
 * Client-side mirror of the server `publishGateSchema` — returns the required
 * fields still missing, phrased as actions with the step to fix each. Drives the
 * pre-publish checklist so a vendor never clicks Publish only to be rejected.
 *
 * Address is intentionally absent: it's optional at publish (vendors can travel
 * to clients), so it never blocks.
 */
export function getPublishBlockers(profile: VendorRow): PublishBlocker[] {
  const blockers: PublishBlocker[] = [];

  if (!profile.business_name?.trim()) {
    blockers.push({ field: 'business_name', label: 'Add your business name', step: 'basics' });
  }
  if (!profile.category) {
    blockers.push({ field: 'category', label: 'Choose a category', step: 'basics' });
  }
  if (!profile.bio?.trim()) {
    blockers.push({ field: 'bio', label: 'Write a short bio', step: 'basics' });
  }
  if (!profile.instagram_handle || !INSTAGRAM_RE.test(profile.instagram_handle.replace(/^@/, ''))) {
    blockers.push({
      field: 'instagram_handle',
      label: 'Add your Instagram handle',
      step: 'online',
    });
  }
  if (!profile.portfolio_images || profile.portfolio_images.length === 0) {
    blockers.push({
      field: 'portfolio_images',
      label: 'Upload at least one photo',
      step: 'portfolio',
    });
  }
  if (!profile.languages || profile.languages.length === 0) {
    blockers.push({ field: 'languages', label: 'Pick the languages you speak', step: 'details' });
  }
  if (profile.years_in_business == null) {
    blockers.push({
      field: 'years_in_business',
      label: 'Add your years in business',
      step: 'details',
    });
  }
  if (!VALID_SLA_HOURS.includes(profile.response_sla_hours)) {
    blockers.push({
      field: 'response_sla_hours',
      label: 'Set your response time',
      step: 'details',
    });
  }

  return blockers;
}
