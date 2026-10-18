import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCartsForBuyer } from '@/services/cart.service';
import { getMeasurementProfiles } from '@/services/measurements.service';
import { BagBoutiqueCard } from '@/components/shop/BagBoutiqueCard';
import type { BagMeasurementProfile } from '@/components/shop/BagMtmResolve';
import type { MeasurementGarment, MeasurementUnit } from '@/types/database.types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your bag' };

export default async function BagPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/bag');

  const [cartsResult, profilesResult] = await Promise.all([
    getCartsForBuyer(supabase, user.id),
    getMeasurementProfiles(supabase, user.id),
  ]);
  const carts = (cartsResult.data ?? []).filter((c) => c.lines.length > 0);
  const profiles: BagMeasurementProfile[] = (profilesResult.data ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    garment: row.garment as MeasurementGarment,
    unit: row.unit as MeasurementUnit,
    measurements: (row.measurements ?? {}) as Record<string, number>,
  }));

  return (
    <main className="mx-auto max-w-[720px] px-4 py-10 md:py-14">
      <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
        Your bag &middot; {carts.length} {carts.length === 1 ? 'boutique' : 'boutiques'}
      </p>
      <h1 className="mb-8 font-display text-[34px] font-bold leading-[0.96] tracking-tight text-ink">
        Review &amp; check out
      </h1>

      {carts.length === 0 ? (
        <div className="rounded-lg border border-hairline p-8 text-center">
          <p className="font-display text-2xl text-ink">Your bag is empty</p>
          <Link
            href="/shop"
            className="mt-3 inline-block text-sm font-semibold text-indigo hover:text-hot-pink"
          >
            Browse the shop
          </Link>
        </div>
      ) : (
        carts.map((cart) => (
          <BagBoutiqueCard key={cart.vendorProfileId} cart={cart} profiles={profiles} />
        ))
      )}
    </main>
  );
}
