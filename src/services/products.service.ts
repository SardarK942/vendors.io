import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/types/database.types';
import type { CreateProductInput, UpdateProductInput, ServiceResult } from '@/types';
import type { GarmentType } from '@/types/database.types';

// Shop prototype · Slice 1 — catalog + inventory service.
//
// Physical-goods product line for bridal_wear vendors (see migration 00082 +
// docs/superpowers/specs/2026-09-25-shop-slice-1-catalog-inventory.md). Mirrors
// packages.service: all DB access flows through the passed RLS-enforced client
// (never service-role), variants are a delete-then-insert replace set, and a
// product is returned with its variants nested.

type ProductRow = Database['public']['Tables']['products']['Row'];
type ProductVariantRow = Database['public']['Tables']['product_variants']['Row'];

export interface ProductWithVariants extends ProductRow {
  variants: ProductVariantRow[];
}

/** Minimal selling-vendor reference embedded on buyer-facing product reads. */
export interface ProductVendorRef {
  business_name: string;
  slug: string;
  verified: boolean;
}

/** Product + variants + the (nullable) selling vendor, for buyer catalog/detail. */
export interface ProductWithVendor extends ProductWithVariants {
  vendor: ProductVendorRef | null;
}

// The to-one `vendor_profiles` embed comes back as an object (or, under some
// inference paths, a single-element array). Coerce it to a lone ref | null.
function normalizeVendorRef(raw: unknown): ProductVendorRef | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== 'object') return null;
  const { business_name, slug, verified } = value as Record<string, unknown>;
  if (typeof business_name !== 'string' || typeof slug !== 'string') return null;
  return { business_name, slug, verified: verified === true };
}

const PRODUCT_WITH_VENDOR_SELECT =
  '*, variants:product_variants(*), vendor:vendor_profiles(business_name, slug, verified)';

function withVendor(row: Record<string, unknown>): ProductWithVendor {
  const { vendor, ...rest } = row;
  return { ...(rest as unknown as ProductWithVariants), vendor: normalizeVendorRef(vendor) };
}

interface GetActiveProductsOpts {
  garmentType?: GarmentType;
  limit?: number;
}

// ─── Read: active catalog ───────────────────────────────────────────────────

export async function getActiveProducts(
  supabase: SupabaseClient<Database>,
  opts: GetActiveProductsOpts = {}
): Promise<ServiceResult<ProductWithVendor[]>> {
  let query = supabase.from('products').select(PRODUCT_WITH_VENDOR_SELECT).eq('status', 'active');

  if (opts.garmentType) query = query.eq('garment_type', opts.garmentType);

  query = query.order('display_order').order('created_at', { ascending: false });

  if (opts.limit) query = query.limit(opts.limit);

  const { data, error } = await query;
  if (error) return { error: error.message, status: 500 };
  return {
    data: (data ?? []).map((row) => withVendor(row as Record<string, unknown>)),
    status: 200,
  };
}

// ─── Read: single product (active OR owner — RLS enforces visibility) ────────

export async function getProductById(
  supabase: SupabaseClient<Database>,
  productId: string
): Promise<ServiceResult<ProductWithVendor>> {
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_WITH_VENDOR_SELECT)
    .eq('id', productId)
    .maybeSingle();

  if (error) return { error: error.message, status: 500 };
  if (!data) return { error: 'Product not found', status: 404 };
  return { data: withVendor(data as Record<string, unknown>), status: 200 };
}

// ─── Read: a vendor's full catalog (all statuses — owner view) ───────────────

export async function getProductsByVendor(
  supabase: SupabaseClient<Database>,
  vendorProfileId: string
): Promise<ServiceResult<ProductWithVariants[]>> {
  const { data, error } = await supabase
    .from('products')
    .select('*, variants:product_variants(*)')
    .eq('vendor_profile_id', vendorProfileId)
    .order('display_order');

  if (error) return { error: error.message, status: 500 };
  return { data: (data ?? []) as ProductWithVariants[], status: 200 };
}

// ─── Create (gated to bridal_wear vendors) ───────────────────────────────────

export async function createProduct(
  supabase: SupabaseClient<Database>,
  vendorProfileId: string,
  input: CreateProductInput
): Promise<ServiceResult<ProductWithVariants>> {
  // Gate: the Shop is bridal_wear-only in this prototype.
  const { data: profile, error: profileError } = await supabase
    .from('vendor_profiles')
    .select('category')
    .eq('id', vendorProfileId)
    .maybeSingle();

  if (profileError) return { error: profileError.message, status: 500 };
  if (!profile) return { error: 'Vendor profile not found', status: 404 };
  if (profile.category !== 'bridal_wear') {
    return { error: 'Shop is only available to bridal wear vendors', status: 403 };
  }

  const { variants, ...productData } = input;

  // Append at end of the vendor's catalog.
  const { count } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_profile_id', vendorProfileId);

  const { data: product, error: productError } = await supabase
    .from('products')
    .insert({
      ...productData,
      // attributes is a free-form JSONB bag (Record<string, unknown> from Zod);
      // cast to the DB Json type at the write boundary.
      attributes: productData.attributes as Json,
      vendor_profile_id: vendorProfileId,
      display_order: count ?? 0,
    })
    .select('*')
    .single();

  if (productError) return { error: productError.message, status: 400 };

  let createdVariants: ProductVariantRow[] = [];
  if (variants && variants.length > 0) {
    const variantRows = variants.map((v, i) => ({
      ...v,
      product_id: product.id,
      display_order: i,
    }));
    const { data, error: variantsError } = await supabase
      .from('product_variants')
      .insert(variantRows)
      .select('*');
    if (variantsError) {
      // Roll back the product so we don't leave a variant-less orphan.
      await supabase.from('products').delete().eq('id', product.id);
      return { error: variantsError.message, status: 400 };
    }
    createdVariants = (data ?? []) as ProductVariantRow[];
  }

  return { data: { ...(product as ProductRow), variants: createdVariants }, status: 201 };
}

// ─── Update (ownership-checked; variants replace-set) ────────────────────────

export async function updateProduct(
  supabase: SupabaseClient<Database>,
  productId: string,
  vendorProfileId: string,
  input: UpdateProductInput
): Promise<ServiceResult<ProductWithVariants>> {
  // Verify ownership before touching anything.
  const { data: existing } = await supabase
    .from('products')
    .select('id, vendor_profile_id')
    .eq('id', productId)
    .maybeSingle();

  if (!existing || existing.vendor_profile_id !== vendorProfileId) {
    return { error: 'Product not found or not yours', status: 403 };
  }

  const { variants, ...productData } = input;

  const { data: product, error } = await supabase
    .from('products')
    .update({
      ...productData,
      attributes: productData.attributes as Json | undefined,
      updated_at: new Date().toISOString(),
    })
    .eq('id', productId)
    .select('*')
    .single();

  if (error) return { error: error.message, status: 400 };

  // Variants replace pattern (mirrors package_addons): delete all, re-insert.
  if (variants !== undefined) {
    await supabase.from('product_variants').delete().eq('product_id', productId);
    if (variants.length > 0) {
      const variantRows = variants.map((v, i) => ({
        ...v,
        product_id: productId,
        display_order: i,
      }));
      const { error: insertError } = await supabase.from('product_variants').insert(variantRows);
      if (insertError) return { error: insertError.message, status: 400 };
    }
  }

  const { data: currentVariants } = await supabase
    .from('product_variants')
    .select('*')
    .eq('product_id', productId)
    .order('display_order');

  return {
    data: { ...(product as ProductRow), variants: (currentVariants ?? []) as ProductVariantRow[] },
    status: 200,
  };
}

// ─── Delete (hard; cascade removes variants) ─────────────────────────────────

export async function deleteProduct(
  supabase: SupabaseClient<Database>,
  productId: string,
  vendorProfileId: string
): Promise<ServiceResult<{ deleted: true }>> {
  const { data: existing } = await supabase
    .from('products')
    .select('id, vendor_profile_id')
    .eq('id', productId)
    .maybeSingle();

  if (!existing || existing.vendor_profile_id !== vendorProfileId) {
    return { error: 'Product not found or not yours', status: 403 };
  }

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', productId)
    .eq('vendor_profile_id', vendorProfileId);

  if (error) return { error: error.message, status: 400 };
  return { data: { deleted: true }, status: 200 };
}
