import { createServerSupabaseClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { BookingForm } from '@/components/forms/BookingForm';
import {
  BOOKING_SELECTION_COOKIE_NAME,
  decodeBookingSelectionCookie,
} from '@/lib/booking-selection';

export const dynamic = 'force-dynamic';

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

  // Load selection from cookie (set by /api/booking-selection POST)
  const cookieStore = await cookies();
  const selectionCookie = cookieStore.get(BOOKING_SELECTION_COOKIE_NAME);

  if (!selectionCookie) {
    // No selection — send couple back to vendor profile to pick a package
    redirect(`/vendors/${slug}`);
  }

  // Decode AND verify the HMAC-signed cookie value
  const selection = await decodeBookingSelectionCookie(selectionCookie.value);

  if (!selection?.package_id) redirect(`/vendors/${slug}`);

  // Load vendor
  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select(
      'id, slug, business_name, base_city, base_state, base_address_line_1, base_postal_code, base_google_place_id, base_address_public'
    )
    .eq('slug', slug)
    .single();

  if (!vendor) notFound();

  // Load package + addons
  const { data: pkg } = await supabase
    .from('packages')
    .select('*, addons:package_addons(*)')
    .eq('id', selection.package_id)
    .single();

  if (!pkg || !pkg.is_active) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Book {vendor.business_name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fill in your event details below. The vendor will review and respond within 72 hours.
        </p>
      </div>
      <BookingForm
        vendor={vendor as Parameters<typeof BookingForm>[0]['vendor']}
        pkg={{
          ...pkg,
          addons: (pkg.addons ?? []) as { id: string; name: string; price_delta_cents: number }[],
        }}
        selectedAddons={selection.selected_addons}
      />
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
