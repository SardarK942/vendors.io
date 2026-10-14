import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { ServiceResult } from '@/types';
import type { OrderConfirmationOrder } from '@/components/shop/OrderConfirmation';

// Shop SP2a: read an order (with boutique name + product thumbnails) for the
// confirmation views. Uses the caller's RLS client, so visibility is limited to
// the buyer or the owning vendor. Relational selects are coerced at the boundary.

type Rec = Record<string, unknown>;
export type OrderLookup =
  | { kind: 'id'; id: string }
  | { kind: 'session'; sessionId: string; buyerId: string }
  | { kind: 'latest'; buyerId: string };

const SELECT = '*, vendor:vendor_profiles(business_name), order_items(*, product:products(images))';

function one(v: unknown): Rec | null {
  const x = Array.isArray(v) ? v[0] : v;
  return x && typeof x === 'object' ? (x as Rec) : null;
}

export async function getOrderForView(
  supabase: SupabaseClient<Database>,
  lookup: OrderLookup
): Promise<ServiceResult<OrderConfirmationOrder | null>> {
  const base = supabase.from('orders').select(SELECT);
  const query =
    lookup.kind === 'id'
      ? base.eq('id', lookup.id)
      : lookup.kind === 'session'
        ? base
            .eq('stripe_checkout_session_id', lookup.sessionId)
            .eq('buyer_user_id', lookup.buyerId)
        : base
            .eq('buyer_user_id', lookup.buyerId)
            .order('created_at', { ascending: false })
            .limit(1);
  const { data, error } = await query.maybeSingle();
  if (error) return { error: error.message, status: 500 };
  if (!data) return { data: null, status: 200 };

  const row = data as unknown as Rec;
  const rawItems = Array.isArray(row.order_items) ? (row.order_items as Rec[]) : [];
  const order: OrderConfirmationOrder = {
    id: String(row.id),
    status: row.status as OrderConfirmationOrder['status'],
    vendorName: String(one(row.vendor)?.business_name ?? 'the boutique'),
    fulfillmentType: row.fulfillment_type as OrderConfirmationOrder['fulfillmentType'],
    itemSubtotalCents: Number(row.item_subtotal_cents),
    shippingCents: Number(row.shipping_cents),
    taxCents: Number(row.tax_cents),
    totalCents: Number(row.total_cents),
    confirmDeadlineAt: String(row.confirm_deadline_at),
    items: rawItems.map((it) => {
      const images = one(it.product)?.images;
      return {
        id: String(it.id),
        name: String(it.product_name_snapshot),
        variantLabel:
          typeof it.variant_label_snapshot === 'string' ? it.variant_label_snapshot : null,
        unitPriceCents: Number(it.unit_price_cents),
        quantity: Number(it.quantity),
        customizationType: typeof it.customization_type === 'string' ? it.customization_type : null,
        measurementSnapshot: it.measurement_snapshot ?? null,
        imageUrl: Array.isArray(images) && typeof images[0] === 'string' ? images[0] : null,
      };
    }),
  };
  return { data: order, status: 200 };
}
