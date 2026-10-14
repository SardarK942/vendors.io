'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { GuidedMeasurementModal } from '@/components/measurements/GuidedMeasurementModal';
import { garmentToMeasurementGarment } from '@/lib/products/customization';
import type { CartLineView } from '@/services/cart.service';
import type { MeasurementGarment, MeasurementUnit } from '@/types/database.types';

export interface BagMeasurementProfile {
  id: string;
  label: string;
  garment: MeasurementGarment;
  unit: MeasurementUnit;
  measurements: Record<string, number>;
}

interface BagMtmResolveProps {
  line: CartLineView;
  profiles: BagMeasurementProfile[];
}

// Per-line made-to-measure resolve: attach a saved profile, or open the guided
// modal to create one. Attaching PATCHes the cart item, then refreshes the bag.
export function BagMtmResolve({ line, profiles }: BagMtmResolveProps) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = React.useState(false);
  const [picking, setPicking] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const garment = garmentToMeasurementGarment(line.garmentType);
  const matching = profiles.filter((p) => p.garment === garment);
  const attached = profiles.find((p) => p.id === line.measurementProfileId);

  async function attach(profileId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/cart/items/${line.cartItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ measurement_profile_id: profileId }),
      });
      if (!res.ok) throw new Error('attach failed');
      setPicking(false);
      router.refresh();
    } catch {
      toast.error('Could not attach those measurements. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function start() {
    if (matching.length > 0) setPicking(true);
    else setModalOpen(true);
  }

  const resolved = line.measurementProfileId != null && !picking;

  return (
    <div className="mt-2.5">
      {resolved ? (
        <div className="flex items-center gap-2 text-[12.5px] font-medium text-ink-muted">
          <span aria-hidden="true">&#10003;</span>
          <span>Measurements added{attached ? ` · “${attached.label}”` : ''}</span>
          <button
            type="button"
            onClick={start}
            className="text-xs font-semibold text-indigo hover:text-hot-pink"
          >
            Change
          </button>
        </div>
      ) : picking ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`mp-${line.cartItemId}`}>
            Saved measurements
          </label>
          <select
            id={`mp-${line.cartItemId}`}
            disabled={saving}
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) void attach(e.target.value);
            }}
            className="h-8 rounded-md border border-hairline bg-cream px-2 text-xs text-ink"
          >
            <option value="" disabled>
              Choose a saved profile
            </option>
            {matching.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="text-xs font-semibold text-indigo hover:text-hot-pink"
          >
            New measurements
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-indigo">Measurements needed</span>
          <Button type="button" variant="secondary" size="sm" onClick={start}>
            Add measurements
          </Button>
        </div>
      )}

      <GuidedMeasurementModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSaved={() => {
          setPicking(true);
          router.refresh();
        }}
      />
    </div>
  );
}
