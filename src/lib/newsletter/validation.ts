import { z } from 'zod';

const SOURCE_ALLOWLIST = ['footer', 'hero', 'post-booking'] as const;

export type NewsletterSource = (typeof SOURCE_ALLOWLIST)[number];

export const newsletterSubscribeSchema = z.object({
  email: z.string().min(1).email().max(254),
  source: z.enum(SOURCE_ALLOWLIST).default('footer'),
});

export type NewsletterSubscribeInput = z.infer<typeof newsletterSubscribeSchema>;
