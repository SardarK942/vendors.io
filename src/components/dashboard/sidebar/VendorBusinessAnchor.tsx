import * as React from 'react';
import { BadgeCheck } from 'lucide-react';

interface BusinessData {
  business_name: string | null;
  verified: boolean | null;
  city: string | null;
}

interface Props {
  business: BusinessData | null;
}

export function VendorBusinessAnchor({ business }: Props) {
  if (!business || !business.business_name) return null;

  return (
    <div className="flex flex-col gap-2 border-b border-hairline px-3 py-3">
      <span className="text-balance font-display text-[15.5px] font-medium leading-tight tracking-tight text-ink">
        {business.business_name}
      </span>
      <div className="flex items-center gap-2">
        {business.verified ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-indigo/20 bg-indigo/10 px-1.5 py-0.5 text-indigo">
            <BadgeCheck className="size-3" aria-hidden="true" strokeWidth={2.4} />
            <span className="font-mono text-[8px] font-extrabold uppercase tracking-wider">
              Verified
            </span>
          </span>
        ) : null}
        {business.city ? <span className="text-[10px] text-ink-soft">{business.city}</span> : null}
      </div>
    </div>
  );
}
