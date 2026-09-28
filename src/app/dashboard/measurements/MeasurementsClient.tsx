'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MeasurementGarment, MeasurementUnit } from '@/types/database.types';
import { getMeasurementSchema, GARMENT_META } from '@/lib/products/measurement-schemas';
import { missingCount } from '@/lib/products/measurement-validation';
import { GuidedMeasurementModal } from '@/components/measurements/GuidedMeasurementModal';

export interface MeasurementProfileView {
  id: string;
  label: string;
  garment: MeasurementGarment;
  unit: MeasurementUnit;
  measurements: Record<string, number>;
  updatedAt: string;
}

const dateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

export function MeasurementsClient({ profiles }: { profiles: MeasurementProfileView[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<MeasurementProfileView | null>(null);

  function openAdd() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(profile: MeasurementProfileView) {
    setEditing(profile);
    setOpen(true);
  }

  return (
    <div className="space-y-6">
      {profiles.length === 0 ? (
        <div className="rounded-lg border border-hairline bg-cream-soft/40 px-8 py-14 text-center">
          <p className="font-display text-2xl text-ink">No measurement profiles yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
            Add the bride&apos;s or groom&apos;s measurements to reuse at checkout.
          </p>
          <Button variant="primary" className="mt-5" iconLeading={Plus} onClick={openAdd}>
            Add measurements
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {profiles.map((profile) => {
              const schema = getMeasurementSchema(profile.garment);
              const total = schema.length;
              const filled = total - missingCount(profile.garment, profile.measurements);
              const meta = GARMENT_META[profile.garment];
              return (
                <div key={profile.id} className="rounded-lg border border-hairline bg-cream p-6">
                  <p className="font-display text-xl text-ink">{profile.label}</p>
                  <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-indigo">
                    {meta.noun}
                  </p>
                  <p className="mt-3 text-sm text-ink-soft">
                    {filled} of {total} measurements · updated{' '}
                    {dateFmt.format(new Date(profile.updatedAt))}
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-4"
                    iconLeading={Pencil}
                    onClick={() => openEdit(profile)}
                  >
                    Edit
                  </Button>
                </div>
              );
            })}
          </div>

          <Button variant="tertiary" iconLeading={Plus} onClick={openAdd}>
            Add measurements
          </Button>
        </>
      )}

      <GuidedMeasurementModal
        open={open}
        onOpenChange={setOpen}
        initialProfile={editing ?? undefined}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
