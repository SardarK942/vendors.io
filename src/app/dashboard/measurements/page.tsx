import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PageTitle } from '@/components/dashboard/PageTitle';
import { getMeasurementProfiles } from '@/services/measurements.service';
import type { MeasurementGarment, MeasurementUnit } from '@/types/database.types';
import { MeasurementsClient, type MeasurementProfileView } from './MeasurementsClient';

export const dynamic = 'force-dynamic';

export default async function MeasurementsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const result = await getMeasurementProfiles(supabase, user.id);
  const rows = result.data ?? [];

  // measurements is stored as jsonb (machine-key → inches); narrow it at the
  // read boundary to the shape the modal/summary expect.
  const profiles: MeasurementProfileView[] = rows.map((row) => ({
    id: row.id,
    label: row.label,
    garment: row.garment as MeasurementGarment,
    unit: row.unit as MeasurementUnit,
    measurements: (row.measurements ?? {}) as Record<string, number>,
    updatedAt: row.updated_at,
  }));

  return (
    <div className="space-y-6">
      <PageTitle subtitle="Take each measurement once, save it as a reusable fit profile, and reuse it at checkout for made-to-measure outfits.">
        Measurements
      </PageTitle>

      <MeasurementsClient profiles={profiles} />
    </div>
  );
}
