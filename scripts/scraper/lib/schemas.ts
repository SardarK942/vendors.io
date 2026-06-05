import { z } from 'zod';

export const SCRAPED_SOURCES = [
  'google_maps',
  'instagram',
  'il_desi_arab_catering',
  'hand_curated',
  'searchgraph',
  'tiktok',
] as const;

export const scrapedRowSchema = z.object({
  source: z.enum([
    'google_maps',
    'instagram',
    'il_desi_arab_catering',
    'hand_curated',
    'searchgraph',
    'tiktok',
  ]),
  source_external_id: z.string().optional(),
  business_name: z.string().min(1),
  category: z.string().optional(),
  tags: z.array(z.string()).default([]),
  city: z.string().optional(),
  state: z.string().default('IL'),
  postal_code: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  instagram_handle: z.string().optional(),
  tiktok_handle: z.string().optional(),
  facebook_url: z.string().optional(),
  bio: z.string().optional(),
  photos: z.array(z.string()).default([]),
  raw: z.object({}).passthrough(),
  enriched: z.object({}).passthrough().optional(),
});

export type ScrapedRow = z.infer<typeof scrapedRowSchema>;
