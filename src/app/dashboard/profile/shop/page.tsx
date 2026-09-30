import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageTitle } from '@/components/dashboard/PageTitle';
import { getActiveVendorProfile } from '@/lib/vendor/active';
import { getProductsByVendor } from '@/services/products.service';
import { GARMENT_TYPE_LABELS } from '@/lib/products/garment-types';
import { PublishConfetti } from '@/components/celebration/PublishConfetti';
import type { ProductStatus } from '@/types/database.types';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<ProductStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  out_of_stock: 'Out of stock',
  archived: 'Archived',
};

const STATUS_VARIANT: Record<ProductStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'secondary',
  active: 'default',
  out_of_stock: 'destructive',
  archived: 'outline',
};

function formatPrice(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    // Guard against an unexpected currency code.
    return `${(cents / 100).toFixed(0)} ${currency.toUpperCase()}`;
  }
}

interface ShopPageProps {
  searchParams: Promise<{ just_onboarded?: string }>;
}

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const { just_onboarded } = await searchParams;
  const justOnboarded = just_onboarded === '1';

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { profile: vendorProfile } = await getActiveVendorProfile(supabase, user.id);
  if (!vendorProfile) redirect('/dashboard/profile');

  // BRIDAL-WEAR GATE — the Shop is a bridal_wear-only prototype. Non-bridal
  // vendors get a clean empty state, never the editor.
  if (vendorProfile.category !== 'bridal_wear') {
    return (
      <div className="space-y-6">
        <PageTitle>Shop</PageTitle>
        <Card className="p-12 text-center">
          <h2 className="text-lg font-semibold">
            The Shop is only available for bridal-wear vendors
          </h2>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground">
            Your business is listed under{' '}
            <strong>{vendorProfile.category ?? 'another category'}</strong>. The product Shop
            (garments with sizes and inventory) is currently limited to bridal-wear vendors while we
            pilot it.
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link href="/dashboard/profile">Back to profile</Link>
          </Button>
        </Card>
      </div>
    );
  }

  const { data: productsData } = await getProductsByVendor(supabase, vendorProfile.id);
  const products = productsData ?? [];

  return (
    <div className="space-y-6">
      {justOnboarded ? (
        <>
          <PublishConfetti />
          <div className="rounded-md border border-hot-pink/25 bg-hot-pink/5 p-6">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-hot-pink">
              You&rsquo;re live
            </p>
            <h2 className="mt-1.5 font-display text-2xl font-semibold text-ink">
              Your profile is published. Add your first outfit.
            </h2>
            <p className="mt-1 text-pretty text-sm text-ink-soft">
              Couples can now find you in the marketplace. Build out your shop with garments —
              photos, sizes, and inventory — and set them active when they&rsquo;re ready.
            </p>
          </div>
        </>
      ) : null}
      <div className="flex items-center justify-between">
        <div>
          <PageTitle>Your Shop</PageTitle>
          <p className="text-muted-foreground">
            List bridal &amp; groom wear with photos, sizes, and inventory. Draft products stay
            hidden until you set them active.
          </p>
        </div>
        <Button
          asChild
          className="bg-hot-pink text-cream hover:-translate-y-px hover:bg-hot-pink/90 hover:shadow-pink motion-reduce:hover:translate-y-0"
        >
          <Link href="/dashboard/profile/shop/new">+ Add product</Link>
        </Button>
      </div>

      {products.length === 0 ? (
        <Card className="p-12 text-center">
          <h2 className="text-lg font-semibold">No products yet</h2>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground">
            Add your first garment — a saree, lehenga, sherwani, or accessory — with photos, sizes,
            and stock. You can keep it as a draft until it&rsquo;s ready.
          </p>
          <Button
            asChild
            size="lg"
            className="mt-6 bg-hot-pink text-cream hover:-translate-y-px hover:bg-hot-pink/90 hover:shadow-pink motion-reduce:hover:translate-y-0"
          >
            <Link href="/dashboard/profile/shop/new">+ Add your first product</Link>
          </Button>
        </Card>
      ) : (
        <div className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline">
          {products.map((product) => {
            const totalStock = product.variants.reduce(
              (sum, v) => sum + (v.stock_quantity ?? 0),
              0
            );
            return (
              <Link
                key={product.id}
                href={`/dashboard/profile/shop/${product.id}`}
                className="flex items-center gap-4 bg-cream px-4 py-3 transition-colors hover:bg-ink/[.03]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{product.title}</p>
                  <p className="text-xs text-ink-soft">
                    {GARMENT_TYPE_LABELS[product.garment_type]}
                    {product.variants.length > 0
                      ? ` · ${product.variants.length} size${product.variants.length === 1 ? '' : 's'} · ${totalStock} in stock`
                      : ' · made to order'}
                  </p>
                </div>
                <span className="shrink-0 text-sm tabular-nums text-ink">
                  {formatPrice(product.base_price_cents, product.currency)}
                </span>
                <Badge variant={STATUS_VARIANT[product.status]} className="shrink-0">
                  {STATUS_LABELS[product.status]}
                </Badge>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
