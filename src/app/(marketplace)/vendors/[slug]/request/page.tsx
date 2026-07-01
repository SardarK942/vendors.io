import { createServerSupabaseClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { CustomRequestForm } from '@/components/booking/CustomRequestForm';

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

  if (!vendor) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl py-12">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-hot-pink">
        Custom request
      </p>
      <h1 className="text-balance font-display text-3xl font-bold tracking-[-0.018em] text-ink">
        Tell {vendor.business_name} what you need
      </h1>
      <p className="mt-3 text-pretty text-sm text-ink-muted">
        Anything outside their standard packages — multi-day events, large guest counts, destination
        coverage. They&rsquo;ll respond with a custom quote.
      </p>

      <div className="mt-10">
        <CustomRequestForm
          vendorSlug={slug}
          vendorBusinessName={vendor.business_name}
          vendorResponseSlaHours={vendor.response_sla_hours ?? null}
        />
      </div>
    </div>
  );
}
