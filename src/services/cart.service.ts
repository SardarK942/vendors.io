import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { ServiceResult } from '@/types';
import { computeBoutiqueSummary, isReadyToCheckout, type CartLine } from '@/lib/shop/cart-pricing';
import { garmentToMeasurementGarment, offersMadeToMeasure } from '@/lib/products/customization';

// Shop SP2a — buyer cart service. All access flows through the passed RLS client.
// Relational selects are coerced at the boundary (hand-patched types carry empty
// Relationships for the cart tables), following products.service.

export interface AddCartItemInput {
  productId: string;
  variantId: string;
  quantity: number;
}

export interface UpdateCartItemPatch {
  quantity?: number;
  measurement_profile_id?: string | null;
}

export interface CartLineView extends CartLine {
  cartItemId: string;
  productId: string;
  title: string;
  sizeLabel: string;
  garmentType: string;
  measurementProfileId: string | null;
}

export interface BoutiqueCart {
  vendorProfileId: string;
  vendorName: string;
  lines: CartLineView[];
  subtotalCents: number;
  ready: boolean;
}

type Rec = Record<string, unknown>;

// A to-one embed may arrive as an object or a single-element array.
function one(raw: unknown): Rec | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && typeof v === 'object' ? (v as Rec) : null;
}
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

// ─── Add ─────────────────────────────────────────────────────────────────────

export async function addItem(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: AddCartItemInput
): Promise<ServiceResult<{ cartItemId: string }>> {
  const { data: productRaw, error: pErr } = await supabase
    .from('products')
    .select('id, status, vendor_profile_id, vendor:vendor_profiles(category, vendor_origin)')
    .eq('id', input.productId)
    .maybeSingle();
  if (pErr) return { error: pErr.message, status: 500 };
  const product = productRaw as unknown as Rec | null;
  if (!product) return { error: 'Product not found', status: 404 };

  const vendor = one(product.vendor);
  if (
    !vendor ||
    vendor.category !== 'bridal_wear' ||
    vendor.vendor_origin !== 'local' ||
    product.status !== 'active'
  ) {
    return { error: 'This item cannot be purchased online', status: 403 };
  }
  const vendorProfileId = str(product.vendor_profile_id);

  const { data: variant } = await supabase
    .from('product_variants')
    .select('id, product_id')
    .eq('id', input.variantId)
    .maybeSingle();
  if (!variant || variant.product_id !== input.productId) {
    return { error: 'Variant not found', status: 404 };
  }

  // One cart per (buyer, boutique).
  const { data: existingCart } = await supabase
    .from('carts')
    .select('id')
    .eq('user_id', userId)
    .eq('vendor_profile_id', vendorProfileId)
    .maybeSingle();
  let cartId = existingCart?.id;
  if (!cartId) {
    const { data: created, error: cErr } = await supabase
      .from('carts')
      .insert({ user_id: userId, vendor_profile_id: vendorProfileId })
      .select('id')
      .single();
    if (cErr || !created) return { error: cErr?.message ?? 'Could not create cart', status: 400 };
    cartId = created.id;
  }

  // One line per (cart, variant): increment if present.
  const { data: existingItem } = await supabase
    .from('cart_items')
    .select('id, quantity')
    .eq('cart_id', cartId)
    .eq('variant_id', input.variantId)
    .maybeSingle();
  if (existingItem) {
    const { error } = await supabase
      .from('cart_items')
      .update({
        quantity: existingItem.quantity + input.quantity,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingItem.id);
    if (error) return { error: error.message, status: 400 };
    return { data: { cartItemId: existingItem.id }, status: 200 };
  }

  const { data: item, error: iErr } = await supabase
    .from('cart_items')
    .insert({
      cart_id: cartId,
      product_id: input.productId,
      variant_id: input.variantId,
      quantity: input.quantity,
    })
    .select('id')
    .single();
  if (iErr || !item) return { error: iErr?.message ?? 'Could not add item', status: 400 };
  return { data: { cartItemId: item.id }, status: 201 };
}

// ─── Update (quantity and/or attach measurement profile) ─────────────────────

export async function updateItem(
  supabase: SupabaseClient<Database>,
  userId: string,
  itemId: string,
  patch: UpdateCartItemPatch
): Promise<ServiceResult<{ updated: true }>> {
  const { data: itemRaw } = await supabase
    .from('cart_items')
    .select('id, product_id, cart:carts(user_id)')
    .eq('id', itemId)
    .maybeSingle();
  const item = itemRaw as unknown as Rec | null;
  const cart = item ? one(item.cart) : null;
  if (!item || !cart || cart.user_id !== userId) {
    return { error: 'Cart item not found or not yours', status: 403 };
  }

  const update: Database['public']['Tables']['cart_items']['Update'] = {};
  if (patch.quantity !== undefined) update.quantity = patch.quantity;

  if (patch.measurement_profile_id) {
    const { data: profile } = await supabase
      .from('user_measurement_profiles')
      .select('id, user_id, garment')
      .eq('id', patch.measurement_profile_id)
      .maybeSingle();
    if (!profile || profile.user_id !== userId) {
      return { error: 'Measurement profile not found or not yours', status: 403 };
    }
    const { data: product } = await supabase
      .from('products')
      .select('garment_type')
      .eq('id', str(item.product_id))
      .maybeSingle();
    const required = product ? garmentToMeasurementGarment(product.garment_type) : null;
    if (!required || profile.garment !== required) {
      return { error: 'Measurement profile does not match this garment', status: 400 };
    }
    update.measurement_profile_id = profile.id;
  } else if (patch.measurement_profile_id === null) {
    update.measurement_profile_id = null;
  }

  const { error } = await supabase
    .from('cart_items')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id', itemId);
  if (error) return { error: error.message, status: 400 };
  return { data: { updated: true }, status: 200 };
}

// ─── Remove ──────────────────────────────────────────────────────────────────

export async function removeItem(
  supabase: SupabaseClient<Database>,
  userId: string,
  itemId: string
): Promise<ServiceResult<{ deleted: true }>> {
  const { data: itemRaw } = await supabase
    .from('cart_items')
    .select('id, cart:carts(user_id)')
    .eq('id', itemId)
    .maybeSingle();
  const item = itemRaw as unknown as Rec | null;
  const cart = item ? one(item.cart) : null;
  if (!item || !cart || cart.user_id !== userId) {
    return { error: 'Cart item not found or not yours', status: 403 };
  }
  const { error } = await supabase.from('cart_items').delete().eq('id', itemId);
  if (error) return { error: error.message, status: 400 };
  return { data: { deleted: true }, status: 200 };
}

// ─── Read: carts grouped per boutique ────────────────────────────────────────

export async function getCartsForBuyer(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<ServiceResult<BoutiqueCart[]>> {
  const { data, error } = await supabase
    .from('carts')
    .select(
      'id, vendor_profile_id, vendor:vendor_profiles(business_name), items:cart_items(id, variant_id, quantity, measurement_profile_id, product:products(id, title, base_price_cents, garment_type, customization_types), variant:product_variants(id, size_label, price_delta_cents, stock_quantity))'
    )
    .eq('user_id', userId)
    .order('created_at');
  if (error) return { error: error.message, status: 500 };

  const carts: BoutiqueCart[] = ((data ?? []) as unknown as Rec[]).map((cart) => {
    const items = Array.isArray(cart.items) ? (cart.items as Rec[]) : [];
    const lines: CartLineView[] = [];
    for (const it of items) {
      const product = one(it.product);
      const variant = one(it.variant);
      if (!product || !variant) continue;
      const garmentType = str(product.garment_type);
      const customization = Array.isArray(product.customization_types)
        ? (product.customization_types as string[])
        : [];
      const isMadeToMeasure =
        offersMadeToMeasure(customization) && garmentToMeasurementGarment(garmentType) != null;
      const measurementProfileId =
        typeof it.measurement_profile_id === 'string' ? it.measurement_profile_id : null;
      lines.push({
        cartItemId: str(it.id),
        productId: str(product.id),
        title: str(product.title),
        sizeLabel: str(variant.size_label),
        garmentType,
        measurementProfileId,
        variantId: str(it.variant_id),
        unitPriceCents: num(product.base_price_cents) + num(variant.price_delta_cents),
        quantity: num(it.quantity),
        stockQuantity: num(variant.stock_quantity),
        isMadeToMeasure,
        measurementResolved: !isMadeToMeasure || measurementProfileId != null,
      });
    }
    const summary = computeBoutiqueSummary(lines);
    return {
      vendorProfileId: str(cart.vendor_profile_id),
      vendorName: str(one(cart.vendor)?.business_name),
      lines,
      subtotalCents: summary.subtotalCents,
      ready: lines.length > 0 && isReadyToCheckout(summary),
    };
  });

  return { data: carts, status: 200 };
}
