'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import type { PackageWithAddons } from '@/components/marketplace/PackageGrid';
import { getFeaturedPackage, calculateDeposit, formatPrice } from './helpers';

interface BookingBottomBarProps {
  packages: PackageWithAddons[];
  interactive: boolean;
  onRequestBooking: (pkgId: string | null) => void;
}

export function BookingBottomBar({
  packages,
  interactive,
  onRequestBooking,
}: BookingBottomBarProps) {
  const featured = getFeaturedPackage(packages);
  const [selectedId, setSelectedId] = useState<string | null>(featured?.id ?? null);
  const selected = packages.find((p) => p.id === selectedId) ?? featured;
  const [pickerOpen, setPickerOpen] = useState(false);

  // Zero-packages fallback
  if (!selected || selected.base_price_cents == null) {
    return (
      <div
        data-testid="vendor-bottom-bar"
        className="fixed bottom-0 left-0 right-0 z-50 border-t-2 border-ink bg-white px-4 py-2.5 shadow-lg md:hidden"
        style={{ paddingBottom: `calc(0.625rem + env(safe-area-inset-bottom))` }}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-ink/70">Vendor hasn’t listed packages yet.</p>
          <Button size="sm" onClick={() => onRequestBooking(null)} disabled={!interactive}>
            Custom request →
          </Button>
        </div>
      </div>
    );
  }

  const total = selected.base_price_cents;
  const deposit = calculateDeposit(total);
  const isFeatured = selected.id === featured?.id;

  return (
    <div
      data-testid="vendor-bottom-bar"
      className="fixed bottom-0 left-0 right-0 z-50 border-t-2 border-ink bg-white px-4 py-2.5 shadow-lg md:hidden"
      style={{ paddingBottom: `calc(0.625rem + env(safe-area-inset-bottom))` }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-ink">From {formatPrice(total)}</p>
          <p className="text-xs text-ink/70">Pay {formatPrice(deposit)} deposit today</p>

          <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-hot-pink"
              >
                {selected.name}
                {isFeatured ? ' · Most Popular' : ''} <span aria-hidden="true">▲</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="bg-cream">
              <SheetTitle className="font-spectral text-lg text-ink">Choose a package</SheetTitle>
              <div className="mt-4 space-y-2">
                {packages.map((p) => {
                  const isSel = p.id === selectedId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(p.id);
                        setPickerOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-md border p-3 text-left ${
                        isSel
                          ? 'border-ink bg-white'
                          : 'border-ink/15 bg-white hover:border-hot-pink'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-semibold text-ink">{p.name}</p>
                        {p.duration_hours != null && (
                          <p className="text-xs text-ink/60">
                            {p.duration_hours}
                            {' '}hours
                          </p>
                        )}
                      </div>
                      <p className="text-sm font-bold text-ink">
                        {formatPrice(p.base_price_cents ?? 0)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <Button
          size="sm"
          onClick={() => onRequestBooking(selected.id)}
          disabled={!interactive}
          className="shrink-0"
        >
          Request Booking →
        </Button>
      </div>
    </div>
  );
}
