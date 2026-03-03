import { createServerSupabaseClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { BookingRequestForm } from '@/components/forms/BookingRequestForm';

interface BookPageProps {
  params: Promise<{ slug: string }>;
}

export default async function BookPage({ params }: BookPageProps) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?redirect=/vendors/${slug}/book`);

  // Get vendor
  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select('id, business_name, slug')
    .eq('slug', slug)
    .single();

  if (!vendor) notFound();

  return (
    <div className="mx-auto max-w-2xl py-8">
      <BookingRequestForm vendorProfileId={vendor.id} vendorName={vendor.business_name} />
    </div>
  );
}

export async function generateMetadata({ params }: BookPageProps) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select('business_name')
    .eq('slug', slug)
    .single();

  return {
    title: vendor ? `Book ${vendor.business_name}` : 'Book Vendor',
  };
}
