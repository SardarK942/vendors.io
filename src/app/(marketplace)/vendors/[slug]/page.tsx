import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { VendorProfile } from '@/components/marketplace/VendorProfile';
import { VENDOR_CATEGORY_LABELS } from '@/lib/utils';
import { SavedVendorsProvider } from '@/components/marketplace/SavedVendorsProvider';
import { recordVendorProfileView } from '@/services/analytics.actions';
import { appendCustomRequest } from '@/lib/vendor-packages/with-custom-request';
import { getUnclaimedBySlug } from '@/lib/scraped-vendor/public';
import { UnclaimedVendorRoute } from '@/components/marketplace/UnclaimedVendorRoute';

interface VendorPageProps {
  params: Promise<{ slug: string }>;
}

export default async function VendorPage({ params }: VendorPageProps) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (!vendor) {
    const unclaimed = await getUnclaimedBySlug(slug);
    if (unclaimed) return <UnclaimedVendorRoute vendor={unclaimed} />;

    // Slug might have belonged to a scraped_vendor that has since been claimed.
    // The K-2 public RPC filters out claimed rows, so the unclaimed lookup
    // misses them. Look it up directly and redirect to the linked vendor
    // profile's current slug so bookmarks / shared pre-claim URLs keep working.
    const adminClient = createServiceRoleClient();
    const { data: claimedScraped } = await adminClient
      .from('scraped_vendors')
      .select('claimed_vendor_profile_id')
      .eq('slug', slug)
      .not('claimed_at', 'is', null)
      .maybeSingle();
    if (claimedScraped?.claimed_vendor_profile_id) {
      const { data: linked } = await adminClient
        .from('vendor_profiles')
        .select('slug')
        .eq('id', claimedScraped.claimed_vendor_profile_id)
        .maybeSingle();
      if (linked?.slug) redirect(`/vendors/${linked.slug}`);
    }

    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!vendor.onboarding_complete || !vendor.is_active) {
    if (!user || user.id !== vendor.user_id) {
      notFound();
    }
  }

  const isOwner = !!user && user.id === vendor.user_id;

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

  const realPackages = (packagesData ?? []).map((p) => ({
    ...p,
    addons: ((p as { addons?: { display_order: number }[] }).addons ?? []).sort(
      (a, b) => a.display_order - b.display_order
    ),
  }));

  const packages = appendCustomRequest(realPackages, vendor.id);

  // Fire-and-forget view tracking (Sub-project E §9). Not awaited — never blocks
  // the page render. Dedupes per (vendor, ip_hash, UTC day) at the DB layer.
  recordVendorProfileView(vendor.id, vendor.user_id).catch(() => {});

  return (
    <div className="py-8">
      <SavedVendorsProvider>
        <VendorProfile
          vendor={vendor}
          reviews={reviews ?? []}
          packages={packages as unknown as Parameters<typeof VendorProfile>[0]['packages']}
          isOwner={isOwner}
        />
      </SavedVendorsProvider>
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
