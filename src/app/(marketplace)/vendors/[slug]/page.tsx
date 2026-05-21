import { createServerSupabaseClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { VendorProfile } from '@/components/marketplace/VendorProfile';
import { VENDOR_CATEGORY_LABELS } from '@/lib/utils';
import { recordVendorProfileView } from '@/services/analytics.actions';

interface VendorPageProps {
  params: Promise<{ slug: string }>;
}

export default async function VendorPage({ params }: VendorPageProps) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: vendorRaw } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!vendorRaw) notFound();

  // is_active + onboarding_complete exist in the DB (added via A1/B migrations)
  // but are not yet reflected in the generated types — safe at runtime.
  const vendor = vendorRaw as typeof vendorRaw & {
    is_active?: boolean;
    onboarding_complete?: boolean;
  };

  if (!vendor.onboarding_complete || !vendor.is_active) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.id !== vendor.user_id) {
      notFound();
    }
  }

  const { data: reviews } = await supabase
    .from('reviews')
    .select(
      'id, rating_overall, rating_quality, rating_communication, rating_professionalism, rating_value, comment, created_at, users!reviewer_user_id(full_name)'
    )
    .eq('vendor_profile_id', vendor.id)
    .order('created_at', { ascending: false })
    .limit(20);

  // Active packages with their add-ons — feeds the photo-forward PackageGrid.
  // RLS allows public SELECT of active packages.
  const { data: packagesData } = await supabase
    .from('packages')
    .select(
      'id, name, description, base_price_cents, included_items, max_guests, duration_hours, events_count, featured_image_url, gallery_image_urls, vendor_notes_template, location_mode, addons:package_addons(id, name, price_delta_cents, display_order)'
    )
    .eq('vendor_profile_id', vendor.id)
    .eq('is_active', true)
    .order('display_order');

  const packages = (packagesData ?? []).map((p) => ({
    ...p,
    addons: ((p as { addons?: { display_order: number }[] }).addons ?? []).sort(
      (a, b) => a.display_order - b.display_order
    ),
  }));

  // Fire-and-forget view tracking (Sub-project E §9). Not awaited — never blocks
  // the page render. Dedupes per (vendor, ip_hash, UTC day) at the DB layer.
  recordVendorProfileView(vendor.id, vendor.user_id).catch(() => {});

  return (
    <div className="py-8">
      <VendorProfile
        vendor={vendor}
        reviews={reviews ?? []}
        packages={packages as unknown as Parameters<typeof VendorProfile>[0]['packages']}
      />
    </div>
  );
}

export async function generateMetadata({ params }: VendorPageProps) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select('business_name, category, bio')
    .eq('slug', slug)
    .single();

  if (!vendor) return { title: 'Vendor Not Found' };

  const categoryLabel = VENDOR_CATEGORY_LABELS[vendor.category] || vendor.category;

  return {
    title: `${vendor.business_name} — ${categoryLabel}`,
    description:
      vendor.bio?.slice(0, 160) || `${vendor.business_name} — ${categoryLabel} vendor in Chicago.`,
  };
}
