import { createServerSupabaseClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { VendorProfile } from '@/components/marketplace/VendorProfile';
import { VENDOR_CATEGORY_LABELS } from '@/lib/utils';

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
    .single();

  if (!vendor) notFound();

  return (
    <div className="py-8">
      <VendorProfile vendor={vendor} />
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
