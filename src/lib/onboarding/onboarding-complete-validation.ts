import { z } from 'zod';
import { YEARS_IN_BUSINESS } from './welcome-data';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const coupleDataSchema = z.object({
  event_date: z.string().regex(ISO_DATE_RE, 'Expected YYYY-MM-DD').nullable(),
  categories: z.array(z.string().min(1)).min(1).max(5),
});

const vendorDataSchema = z.object({
  category: z.string().min(1),
  years_in_business: z.enum(YEARS_IN_BUSINESS),
});

export const onboardingCompleteSchema = z.discriminatedUnion('skipped', [
  z.object({
    skipped: z.literal(true),
    data: z.null(),
  }),
  z.object({
    skipped: z.literal(false),
    data: z.union([coupleDataSchema, vendorDataSchema]),
  }),
]);

export type OnboardingCompleteInput = z.infer<typeof onboardingCompleteSchema>;
export type CoupleOnboardingData = z.infer<typeof coupleDataSchema>;
export type VendorOnboardingData = z.infer<typeof vendorDataSchema>;

/** Type guard: discriminates between couple and vendor data shapes. */
export function isVendorData(
  data: CoupleOnboardingData | VendorOnboardingData
): data is VendorOnboardingData {
  return 'category' in data && 'years_in_business' in data;
}
