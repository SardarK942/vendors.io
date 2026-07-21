import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { CustomRequestFlow } from '@/components/booking/CustomRequestFlow';
import { getEventOptions } from '@/lib/events/get-event-options';

export const dynamic = 'force-dynamic';

interface RequestPageProps {
  params: Promise<{ slug: string }>;
}

export default async function CustomRequestPage({ params }: RequestPageProps) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/vendors/${slug}/request`);
  }

  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select('business_name, response_sla_hours')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (!vendor) notFound();

  // Load the couple's events so they can link this request to an event function.
  const eventOptions = await getEventOptions(supabase, user.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href={`/vendors/${slug}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
      >
        ← Back to {vendor.business_name}
      </Link>
      <CustomRequestFlow
        vendorSlug={slug}
        vendorBusinessName={vendor.business_name}
        vendorResponseSlaHours={vendor.response_sla_hours ?? null}
        eventOptions={eventOptions}
      />
    </div>
  );
}
