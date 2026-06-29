import { createServerSupabaseClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { PackageEditorForm } from '@/components/forms/PackageEditorForm';
import type { AddonDraft } from '@/components/forms/PackageAddonsEditor';

export const dynamic = 'force-dynamic';

export default async function EditPackagePage({ params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: pkg } = await supabase
    .from('packages')
    .select('*, addons:package_addons(*), vendor_profiles!inner(user_id)')
    .eq('id', params.id)
    .single();

  if (!pkg) notFound();

  const vp = (pkg as Record<string, unknown>).vendor_profiles as { user_id: string } | null;
  if (!vp || vp.user_id !== user.id) notFound();

  const addons = ((pkg as Record<string, unknown>).addons as AddonDraft[] | null) ?? [];

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-pretty text-2xl font-bold">Edit Package</h1>
      <PackageEditorForm
        mode="edit"
        initial={{
          id: pkg.id,
          name: pkg.name,
          description: pkg.description,
          base_price_cents: pkg.base_price_cents,
          max_guests: pkg.max_guests,
          duration_hours: pkg.duration_hours,
          events_count: pkg.events_count,
          featured_image_url: pkg.featured_image_url,
          gallery_image_urls: (pkg.gallery_image_urls as string[]) ?? [],
          included_items: (pkg.included_items as string[]) ?? [],
          vendor_notes_template: pkg.vendor_notes_template ?? null,
          location_mode: pkg.location_mode as 'couple_provides' | 'at_vendor',
          addons,
        }}
      />
    </div>
  );
}
