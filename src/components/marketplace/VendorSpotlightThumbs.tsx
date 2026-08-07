'use client';

import { useState } from 'react';

/**
 * Thumbnail strip for the Vendor Spotlight (H5). Scraped-vendor photo URLs can
 * be dead/expired (IG expiry, un-rehosted rows), so any thumbnail that fails to
 * load is hidden rather than showing a broken-image icon on a featured section.
 * Client island so it can use onError; the parent VendorSpotlight stays a server
 * component that does the data fetch.
 *
 * A broken image sent in the SSR HTML can fire its error event before React
 * attaches onError (pre-hydration), so the ref callback also checks
 * `complete && naturalWidth === 0` at mount to catch that missed case.
 */
export function VendorSpotlightThumbs({ srcs }: { srcs: string[] }) {
  const [broken, setBroken] = useState<Record<number, boolean>>({});
  const markBroken = (i: number) => setBroken((b) => (b[i] ? b : { ...b, [i]: true }));

  if (srcs.every((_, i) => broken[i])) return null;

  return (
    <ul className="m-0 flex list-none gap-2 p-0">
      {srcs.map((src, i) =>
        broken[i] ? null : (
          <li key={i} className="size-16 overflow-hidden rounded-lg bg-ink-soft/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              className="h-full w-full object-cover"
              ref={(el) => {
                if (el && el.complete && el.naturalWidth === 0) markBroken(i);
              }}
              onError={() => markBroken(i)}
            />
          </li>
        )
      )}
    </ul>
  );
}
