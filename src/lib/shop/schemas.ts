import { z } from 'zod';

export const addCartItemSchema = z.object({
  product_id: z.string(),
  variant_id: z.string(),
  quantity: z.number().int().min(1).default(1),
});
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(1).optional(),
  measurement_profile_id: z.string().uuid().nullable().optional(),
});
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

export const checkoutSchema = z.object({
  vendor_profile_id: z.string(),
  fulfillment_type: z.enum(['pickup', 'ship']),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const declineOrderSchema = z.object({
  reason: z.string().optional(),
});
export type DeclineOrderInput = z.infer<typeof declineOrderSchema>;
