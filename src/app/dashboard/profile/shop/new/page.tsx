import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ProductEditorForm } from '@/components/forms/ProductEditorForm';
import { getActiveVendorProfile } from '@/lib/vendor/active';

export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { profile: vendorProfile } = await getActiveVendorProfile(supabase, user.id);
  if (!vendorProfile) redirect('/dashboard/profile?next=/dashboard/profile/shop/new');

  // BRIDAL-WEAR GATE — mirror the list page. Non-bridal vendors can't reach the editor.
  if (vendorProfile.category !== 'bridal_wear') redirect('/dashboard/profile/shop');

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/profile/shop"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to shop
      </Link>
      <h1 className="mb-6 text-pretty text-2xl font-bold">Add Product</h1>
      <ProductEditorForm mode="create" />
    </div>
  );
}
