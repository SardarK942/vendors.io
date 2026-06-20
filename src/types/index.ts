import { z } from 'zod';

// ─── Vendor Schemas ─────────────────────────────────────────────

export const vendorCategorySchema = z.enum([
  'photography',
  'videography',
  'mehndi',
  'hair_makeup',
  'dj',
  'photobooth',
  'catering',
  'venue',
  'decor',
  'invitations',
]);

export type VendorCategory = z.infer<typeof vendorCategorySchema>;

export const vendorProfileSchema = z.object({
  businessName: z.string().min(2).max(100),
  slug: z.string().min(2).max(100),
  category: vendorCategorySchema,
  bio: z.string().max(2000).optional(),
  serviceArea: z.array(z.string()).default(['Chicago']),
  portfolioImages: z.array(z.string().url()).default([]),
  instagramHandle: z.string().max(50).optional(),
  websiteUrl: z.string().url().optional().or(z.literal('')),
  responseSlaHours: z.number().int().positive().default(48),
});

export type VendorProfileInput = z.infer<typeof vendorProfileSchema>;

export const vendorClaimSchema = z.object({
  vendorProfileId: z.string().uuid(),
});

export const vendorSearchSchema = z.object({
  query: z.string().min(1).max(500).optional(),
  category: vendorCategorySchema.optional(),
  priceMin: z.number().int().nonnegative().optional(),
  priceMax: z.number().int().nonnegative().optional(),
  serviceArea: z.string().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(50).default(20),
});

export type VendorSearchInput = z.infer<typeof vendorSearchSchema>;

// ─── Booking Schemas ────────────────────────────────────────────

// ─── EVENT_TYPES: canonical 20-entry constant (Bucket B) ────────

export const EVENT_TYPES = [
  // Cultural / wedding-adjacent
  { id: 'engagement', label: 'Engagement', group: 'cultural' as const },
  { id: 'roka', label: 'Roka', group: 'cultural' as const },
  { id: 'tilak', label: 'Tilak', group: 'cultural' as const },
  { id: 'mehndi', label: 'Mehndi / Henna', group: 'cultural' as const },
  { id: 'sangeet', label: 'Sangeet', group: 'cultural' as const },
  { id: 'nikah', label: 'Nikah', group: 'cultural' as const },
  { id: 'baraat', label: 'Baraat', group: 'cultural' as const },
  { id: 'wedding', label: 'Wedding / Shaadi', group: 'cultural' as const },
  { id: 'reception', label: 'Reception', group: 'cultural' as const },
  { id: 'walima', label: 'Walima / Wedding Feast', group: 'cultural' as const },
  { id: 'aqiqah', label: 'Aqiqah / Baby Naming', group: 'cultural' as const },
  { id: 'multiple', label: 'Multi-event booking', group: 'cultural' as const },
  // General celebration
  { id: 'birthday_party', label: 'Birthday party', group: 'general' as const },
  { id: 'anniversary', label: 'Anniversary', group: 'general' as const },
  { id: 'corporate_event', label: 'Corporate event', group: 'general' as const },
  { id: 'baby_shower', label: 'Baby shower', group: 'general' as const },
  { id: 'bridal_shower', label: 'Bridal shower', group: 'general' as const },
  { id: 'graduation', label: 'Graduation', group: 'general' as const },
  { id: 'quinceanera', label: 'Quinceañera', group: 'general' as const },
  { id: 'sweet_16', label: 'Sweet 16', group: 'general' as const },
] as const;

export type EventTypeId = (typeof EVENT_TYPES)[number]['id'];

export const CULTURAL_EVENT_TYPES = EVENT_TYPES.filter((e) => e.group === 'cultural');
export const GENERAL_EVENT_TYPES = EVENT_TYPES.filter((e) => e.group === 'general');

export const bookingStatusSchema = z.enum([
  'pending',
  'deposit_paid',
  'couple_cancelled',
  'vendor_cancelled',
  'cancelled_mutual',
  'completed',
  'expired',
  'disputed',
  'accepted',
  'adjusted_quote_sent',
  'adjusted_quote_declined',
]);

export type BookingStatus = z.infer<typeof bookingStatusSchema>;

export const cancellerRoleSchema = z.enum(['couple', 'vendor', 'mutual']);
export type CancellerRole = z.infer<typeof cancellerRoleSchema>;

export const cancellationFaultSchema = z.enum(['none', 'vendor_fault', 'force_majeure']);
export type CancellationFault = z.infer<typeof cancellationFaultSchema>;

export const cancelBookingSchema = z.object({
  reason: z.string().max(1000).optional(),
  fault: cancellationFaultSchema.optional(),
});
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;

export const disputeBookingSchema = z.object({
  reason: z.string().min(10).max(2000),
});
export type DisputeBookingInput = z.infer<typeof disputeBookingSchema>;

export const reviewSchema = z.object({
  bookingRequestId: z.string().uuid(),
  ratingOverall: z.number().int().min(1).max(5),
  ratingQuality: z.number().int().min(1).max(5).optional(),
  ratingCommunication: z.number().int().min(1).max(5).optional(),
  ratingProfessionalism: z.number().int().min(1).max(5).optional(),
  ratingValue: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(4000).optional(),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

// ─── Auth Schemas ───────────────────────────────────────────────

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  fullName: z.string().min(2).max(100),
  role: z.enum(['couple', 'vendor']),
  phone: z.string().max(20).optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ─── AI Search Schema ───────────────────────────────────────────

export const aiSearchSchema = z.object({
  query: z.string().min(1).max(500),
});

export type AISearchInput = z.infer<typeof aiSearchSchema>;

// ─── Generic Types ──────────────────────────────────────────────

export type ServiceResult<T> = {
  data?: T;
  error?: string;
  status: number;
};

export type UserRole = 'couple' | 'vendor' | 'admin';

// ─── Sub-project A: Packages + Booking model ────────────────────

export const packageAddonInputSchema = z.object({
  name: z.string().min(1).max(80),
  price_delta_cents: z.number().int(),
});
export type PackageAddonInput = z.infer<typeof packageAddonInputSchema>;

export const packageLocationModeSchema = z.enum(['couple_provides', 'at_vendor']);
export type PackageLocationModeInput = z.infer<typeof packageLocationModeSchema>;

export const createPackageSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(2000),
  base_price_cents: z.number().int().positive(),
  included_items: z.array(z.string().max(200)).max(20).default([]),
  max_guests: z.number().int().positive(),
  duration_hours: z.number().positive(),
  events_count: z.number().int().min(1).max(5).default(1),
  featured_image_url: z.string().url(),
  gallery_image_urls: z.array(z.string().url()).max(2).default([]),
  vendor_notes_template: z.string().max(1000).optional().nullable(),
  location_mode: packageLocationModeSchema.default('couple_provides'),
  addons: z.array(packageAddonInputSchema).max(8).default([]),
});
export type CreatePackageInput = z.infer<typeof createPackageSchema>;

export const updatePackageSchema = createPackageSchema.partial();
export type UpdatePackageInput = z.infer<typeof updatePackageSchema>;

export const setPackageActiveSchema = z.object({
  is_active: z.boolean(),
});
export type SetPackageActiveInput = z.infer<typeof setPackageActiveSchema>;

export const selectedAddonInputSchema = z.object({
  addon_id: z.string().uuid(),
  name: z.string().min(1),
  price_delta_cents: z.number().int(),
});
export type SelectedAddonInput = z.infer<typeof selectedAddonInputSchema>;

export const bookingEventInputSchema = z
  .object({
    sequence: z.number().int().min(1),
    event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
    event_start_time: z.string().datetime(),
    event_end_time: z.string().datetime(),
    event_type_label: z.string().min(1).max(80),
    location_name: z.string().max(120).optional().nullable(),
    address_line_1: z.string().min(1).max(200),
    city: z.string().min(1).max(80),
    state: z.string().min(1).max(80),
    postal_code: z.string().min(1).max(20),
    google_place_id: z.string().optional().nullable(),
    guest_count_override: z.number().int().positive().optional().nullable(),
    location_overridden: z.boolean().default(false),
  })
  .refine((e) => new Date(e.event_end_time) > new Date(e.event_start_time), {
    message: 'event_end_time must be after event_start_time',
    path: ['event_end_time'],
  });
export type BookingEventInput = z.infer<typeof bookingEventInputSchema>;

export const createBookingSchema = z.object({
  vendor_profile_id: z.string().uuid(),
  package_id: z.string().uuid(),
  selected_addons: z.array(selectedAddonInputSchema).default([]),
  guest_count: z.number().int().positive(),
  special_requests: z.string().max(2000).optional().nullable(),
  couple_full_name: z.string().min(1).max(120),
  couple_contact_phone: z.string().min(1).max(40),
  events: z.array(bookingEventInputSchema).min(1).max(5),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const adjustmentReasonSchema = z.enum([
  'travel',
  'guest_count',
  'peak_date',
  'custom',
  'setup_complexity',
  'discount',
  'other',
]);
export type AdjustmentReasonInput = z.infer<typeof adjustmentReasonSchema>;

export const adjustQuoteSchema = z
  .object({
    adjustment_amount_cents: z.number().int(),
    reason: adjustmentReasonSchema,
    explanation: z.string().max(1000).optional().nullable(),
  })
  .refine(
    (d) =>
      d.reason !== 'other' ||
      (d.explanation !== null && d.explanation !== undefined && d.explanation.length > 0),
    { message: "explanation is required when reason is 'other'", path: ['explanation'] }
  );
export type AdjustQuoteInput = z.infer<typeof adjustQuoteSchema>;

// ─── Sub-project F: Notifications ───────────────────────────────────

export const notificationTypeSchema = z.enum([
  'booking_request_received',
  'vendor_accepted',
  'vendor_adjusted_quote',
  'couple_accepted_adjusted',
  'couple_declined_adjusted',
  'deposit_paid',
  'booking_confirmed',
  'booking_auto_cancelled',
  'booking_cancelled',
  'event_completed',
  'booking_completed',
  'review_received',
]);
export type NotificationTypeInput = z.infer<typeof notificationTypeSchema>;

// ─── Sub-project B: Spoken Languages ────────────────────────────

export const SPOKEN_LANGUAGES = [
  'Arabic',
  'Bengali',
  'English',
  'Gujarati',
  'Hindi',
  'Marathi',
  'Punjabi',
  'Spanish',
  'Tamil',
  'Telugu',
  'Urdu',
] as const;

export type SpokenLanguage = (typeof SPOKEN_LANGUAGES)[number];
