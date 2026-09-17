import { z } from 'zod';
import { VENDOR_CATEGORIES } from '@/lib/utils';

export const vendorProfileUpdateSchema = z.object({
  business_name: z.string().min(2).max(100).optional(),
  category: z.enum(VENDOR_CATEGORIES).optional(),
  bio: z.string().max(2000).optional().nullable(),
  service_area: z.array(z.string()).optional(),
  instagram_handle: z.string().max(50).optional().nullable(),
  website_url: z.string().url().optional().nullable().or(z.literal('')),
  response_sla_hours: z.number().int().positive().optional(),
  years_in_business: z.number().int().min(0).max(100).optional().nullable(),
  portfolio_images: z.array(z.string().url()).optional(),
  portfolio_videos: z.array(z.string()).max(3).optional(),
  // base_address fields
  base_address_line_1: z.string().max(200).optional().nullable(),
  base_city: z.string().max(80).optional().nullable(),
  base_state: z.string().max(80).optional().nullable(),
  base_postal_code: z.string().max(20).optional().nullable(),
  base_google_place_id: z.string().optional().nullable(),
  base_address_public: z.boolean().optional(),
  // pause toggle
  is_active: z.boolean().optional(),
  subcategories: z.array(z.string()).optional(),
});
