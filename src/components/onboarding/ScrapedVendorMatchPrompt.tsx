'use client';
import type { ScrapedVendorMatch } from '@/lib/scraped-vendor/match';

interface Props {
  matches: ScrapedVendorMatch[];
  onPick: (id: string) => void;
  onReject: () => void;
}

export function ScrapedVendorMatchPrompt({ matches, onPick, onReject }: Props) {
  return (
    <div className="my-4 rounded-lg border bg-muted/30 p-4">
      <h3 className="mb-2 text-lg font-semibold">We think we already know your business</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        Pick the one that&apos;s yours so we can pre-fill the rest.
      </p>
      <div className="space-y-3">
        {matches.map((m) => (
          <div key={m.id} className="flex gap-3 rounded-md border bg-background p-3">
            {m.photos[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.photos[0]} alt="" className="h-16 w-16 rounded object-cover" />
            )}
            <div className="flex-1">
              <p className="font-medium">{m.business_name}</p>
              <p className="text-xs text-muted-foreground">
                {m.category ?? 'category unknown'} · {m.city ?? 'unknown city'}
                {m.instagram_handle && ` · @${m.instagram_handle}`}
              </p>
              {m.bio && <p className="mt-1 line-clamp-2 text-sm">{m.bio}</p>}
            </div>
            <button
              type="button"
              onClick={() => onPick(m.id)}
              className="rounded-md bg-ink px-3 py-1 text-sm text-cream hover:opacity-90"
            >
              Yes, this is mine
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onReject}
        className="mt-4 text-sm text-muted-foreground underline"
      >
        None of these — start fresh
      </button>
    </div>
  );
}
