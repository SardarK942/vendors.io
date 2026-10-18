import type { ChargeMode } from '@/types/database.types';

/** Marketplace commission on the item subtotal (shipping and tax excluded). */
export const COMMISSION_RATE = 0.1;

/** Commission in integer cents, rounded to the nearest cent. */
export function computeCommissionCents(subtotalCents: number): number {
  return Math.round(subtotalCents * COMMISSION_RATE);
}

export type OrderAmountsInput = {
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
};

export type OrderAmounts = {
  commissionCents: number;
  totalCents: number;
};

/** Order total is subtotal + shipping + tax; commission is on subtotal only. */
export function computeOrderAmounts({
  subtotalCents,
  shippingCents,
  taxCents,
}: OrderAmountsInput): OrderAmounts {
  return {
    commissionCents: computeCommissionCents(subtotalCents),
    totalCents: subtotalCents + shippingCents + taxCents,
  };
}

export type EscrowNetInput = {
  subtotalCents: number;
  shippingCents: number;
  commissionCents: number;
  stripeFeeCents: number;
};

/** Vendor escrow payout: subtotal - commission + shipping - stripe fee (tax excluded). */
export function computeEscrowNetCents({
  subtotalCents,
  shippingCents,
  commissionCents,
  stripeFeeCents,
}: EscrowNetInput): number {
  return subtotalCents - commissionCents + shippingCents - stripeFeeCents;
}

/** Vendors with charges enabled are paid directly; otherwise funds are held in escrow. */
export function resolveChargeMode(chargesEnabled: boolean): ChargeMode {
  return chargesEnabled ? 'direct' : 'escrow';
}
