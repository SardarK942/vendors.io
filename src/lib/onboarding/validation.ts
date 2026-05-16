import { z } from 'zod';

const instagramHandle = z
  .string()
  .min(1, 'Instagram handle is required')
  .transform((s) => s.replace(/^@/, '').trim())
  .pipe(z.string().regex(/^[A-Za-z0-9._]{1,30}$/, 'Invalid Instagram handle'));

export const basicsSchema = z.object({
  businessName: z.string().min(1).max(120),
  category: z.string().min(1),
  bio: z
    .string()
    .min(50, 'Bio must be at least 50 characters')
    .max(500, 'Bio must be at most 500 characters'),
});

export const locationSchema = z.object({
  baseAddressLine1: z.string().min(1, 'Address required'),
  baseCity: z.string().min(1),
  baseState: z.string().min(1),
  basePostalCode: z.string().min(1),
  baseGooglePlaceId: z.string().min(1),
  baseAddressPublic: z.boolean(),
});

export const onlineSchema = z.object({
  instagramHandle: instagramHandle,
  websiteUrl: z
    .union([z.string().url(), z.literal('')])
    .optional()
    .transform((v) => v || ''),
});

export const portfolioSchema = z.object({
  portfolioImages: z
    .array(z.string().url())
    .min(1, 'At least 1 portfolio image is required'),
});

// Server-side gate on the full DB row before flipping onboarding_complete = true.
// Mirrors the four step schemas but reads the DB column names directly.
export const publishGateSchema = z.object({
  business_name: z.string().min(1),
  category: z.string().min(1),
  bio: z.string().min(50).max(500),
  base_address_line_1: z.string().min(1),
  base_city: z.string().min(1),
  base_state: z.string().min(1),
  base_postal_code: z.string().min(1),
  base_google_place_id: z.string().min(1),
  base_address_public: z.boolean(),
  instagram_handle: z.string().regex(/^[A-Za-z0-9._]{1,30}$/),
  website_url: z.string().nullable(),
  portfolio_images: z.array(z.string()).min(1),
});

export type BasicsInput = z.infer<typeof basicsSchema>;
export type LocationInput = z.infer<typeof locationSchema>;
export type OnlineInput = z.infer<typeof onlineSchema>;
export type PortfolioInput = z.infer<typeof portfolioSchema>;
