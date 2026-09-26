import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { ProductEditorForm, type ProductInitial } from '@/components/forms/ProductEditorForm';
import { getActiveVendorProfile } from '@/lib/vendor/active';
import { getProductById } from '@/services/products.service';

export const dynamic = 'force-dynamic';

export default async function EditProductPage({ params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { profile: vendorProfile } = await getActiveVendorProfile(supabase, user.id);
  if (!vendorProfile) redirect('/dashboard/profile');

  // BRIDAL-WEAR GATE — consistent with the list + new pages.
  if (vendorProfile.category !== 'bridal_wear') redirect('/dashboard/profile/shop');

  const { data: product } = await getProductById(supabase, params.id);
  // Not found, or belongs to a different vendor profile (RLS returns it to the
  // owner only, but double-check ownership explicitly).
  if (!product || product.vendor_profile_id !== vendorProfile.id) notFound();

  const initial: ProductInitial = {
    id: product.id,
    title: product.title,
    description: product.description,
    garment_type: product.garment_type,
    base_price_cents: product.base_price_cents,
    currency: product.currency,
    images: product.images ?? [],
    video_uids: product.video_uids ?? [],
    attributes: (product.attributes as Record<string, unknown> | null) ?? null,
    ships_internationally: product.ships_internationally,
    tailoring_available: product.tailoring_available,
    lead_time_days: product.lead_time_days,
    status: product.status,
    variants: product.variants
      .slice()
      .sort((a, b) => a.display_order - b.display_order)
      .map((v) => ({
        size_label: v.size_label,
        sku: v.sku ?? '',
        price_delta_cents: v.price_delta_cents,
        stock_quantity: v.stock_quantity,
      })),
  };

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/profile/shop"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to shop
      </Link>
      <h1 className="mb-6 text-pretty text-2xl font-bold">Edit Product</h1>
      <ProductEditorForm mode="edit" initial={initial} />
    </div>
  );
}
