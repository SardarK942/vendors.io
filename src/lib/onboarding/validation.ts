import { z } from 'zod';
import { SPOKEN_LANGUAGES } from '@/types';
import { RESPONSE_SLA_OPTIONS } from '@/components/marketplace/filters/constants';

const VALID_LANGUAGE_SLUGS = SPOKEN_LANGUAGES.map((lang) => lang.toLowerCase());
const VALID_SLA_VALUES = RESPONSE_SLA_OPTIONS.map((o) => o.value);

const instagramHandle = z
  .string()
  .min(1, 'Instagram handle is required')
  .transform((s) => s.replace(/^@/, '').trim())
  .pipe(z.string().regex(/^[A-Za-z0-9._]{1,30}$/, 'Invalid Instagram handle'));

export const basicsSchema = z.object({
  businessName: z.string().min(1).max(120),
  category: z.string().min(1),
  bio: z.string().max(500, 'Bio must be 500 characters or fewer'),
});

export const locationSchema = z.object({
  baseAddressLine1: z.string().optional(),
  baseCity: z.string().optional(),
  baseState: z.string().optional(),
  basePostalCode: z.string().optional(),
  baseGooglePlaceId: z.string().optional(),
  baseAddressPublic: z.boolean(),
  /** True when vendor checked "I don't have a fixed address". Persisted to vendor_profiles. */
  baseAddressSkipped: z.boolean().optional().default(false),
});

export const onlineSchema = z.object({
  instagramHandle: instagramHandle,
  websiteUrl: z
    .union([z.string().url(), z.literal('')])
    .optional()
    .transform((v) => v || ''),
});

export const portfolioSchema = z.object({
  portfolioImages: z.array(z.string().url()).min(1, 'At least 1 portfolio image is required'),
});

export const detailsSchema = z.object({
  languages: z
    .array(z.string())
    .min(1, 'At least one language is required')
    .refine((arr) => arr.every((s) => VALID_LANGUAGE_SLUGS.includes(s)), 'Invalid language slug'),
  years_in_business: z.number().int().min(0).max(99),
  response_sla_hours: z.number().refine((n) => VALID_SLA_VALUES.includes(n), 'Invalid SLA value'),
});

// Server-side gate on the full DB row before flipping onboarding_complete = true.
// Mirrors the four step schemas but reads the DB column names directly.
export const publishGateSchema = z.object({
  business_name: z.string().min(1),
  category: z.string().min(1),
  bio: z.string().max(500),
  base_address_line_1: z.string().optional(),
  base_city: z.string().optional(),
  base_state: z.string().optional(),
  base_postal_code: z.string().optional(),
  base_google_place_id: z.string().optional(),
  base_address_public: z.boolean(),
  instagram_handle: z.string().regex(/^[A-Za-z0-9._]{1,30}$/),
  website_url: z.string().nullable(),
  portfolio_images: z.array(z.string()).min(1),
  languages: z.array(z.string()).min(1),
  years_in_business: z.number().int().min(0).max(99),
  response_sla_hours: z.number().refine((n) => [1, 4, 24, 48, 72].includes(n)),
});

export type BasicsInput = z.infer<typeof basicsSchema>;
export type LocationInput = z.infer<typeof locationSchema>;
export type OnlineInput = z.infer<typeof onlineSchema>;
export type PortfolioInput = z.infer<typeof portfolioSchema>;
export type DetailsInput = z.infer<typeof detailsSchema>;
