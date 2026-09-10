/**
 * Turns a Zod `flatten()` payload (returned as `details` by the API error
 * boundary on a 400) into a human-readable, field-named message for the couple.
 * Without this, the booking form showed a bare "Validation failed" and the user
 * had no idea which field was wrong.
 */

interface ZodFlatten {
  formErrors?: string[];
  fieldErrors?: Record<string, string[] | undefined>;
}

const FIELD_LABELS: Record<string, string> = {
  guest_count: 'Guest count',
  couple_full_name: 'Your name',
  couple_contact_phone: 'Contact phone',
  events: 'Event details',
  special_requests: 'Special requests',
  event_function_id: 'Event',
  vendor_profile_id: 'Vendor',
  package_id: 'Package',
  selected_addons: 'Add-ons',
};

const GENERIC = 'Please check your details and try again.';

export function formatBookingValidationError(details: unknown): string {
  if (!details || typeof details !== 'object') return GENERIC;
  const { formErrors, fieldErrors } = details as ZodFlatten;

  const parts: string[] = [];
  for (const msg of formErrors ?? []) parts.push(msg);
  for (const [field, msgs] of Object.entries(fieldErrors ?? {})) {
    if (!msgs || msgs.length === 0) continue;
    const label = FIELD_LABELS[field] ?? field;
    parts.push(`${label}: ${msgs.join(', ')}`);
  }

  if (parts.length === 0) return GENERIC;
  return `Please fix the following — ${parts.join('; ')}.`;
}
