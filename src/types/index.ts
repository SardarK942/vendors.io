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
  startingPriceMin: z.number().int().nonnegative().optional(),
  startingPriceMax: z.number().int().nonnegative().optional(),
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

export const eventTypeSchema = z.enum([
  'engagement',
  'mehndi',
  'sangeet',
  'wedding',
  'reception',
  'multiple',
]);

export type EventType = z.infer<typeof eventTypeSchema>;

export const bookingStatusSchema = z.enum([
  'pending',
  'quoted',
  'rejected',
  'deposit_paid',
  'couple_cancelled',
  'vendor_cancelled',
  'cancelled_mutual',
  'completed',
  'expired',
  'disputed',
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

export const bookingRequestSchema = z.object({
  vendorProfileId: z.string().uuid(),
  eventDate: z.string().date(),
  eventType: eventTypeSchema,
  guestCount: z.number().int().positive().optional(),
  budgetMin: z.number().int().nonnegative().optional(),
  budgetMax: z.number().int().nonnegative().optional(),
  specialRequests: z.string().max(1000).optional(),
  couplePhone: z.string().max(20).optional(),
  coupleEmail: z.string().email().optional(),
});

export type BookingRequestInput = z.infer<typeof bookingRequestSchema>;

export const quoteSchema = z.object({
  quoteAmount: z.number().int().positive(),
  quoteNotes: z.string().max(1000).optional(),
});

export type QuoteInput = z.infer<typeof quoteSchema>;

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
