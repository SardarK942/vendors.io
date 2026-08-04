import * as React from 'react';
import { Check } from 'lucide-react';

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
    <div className="flex flex-col gap-2 px-2 py-3">
      <span className="text-balance font-serif text-[19px] font-medium leading-tight tracking-tight text-ink">
        {business.business_name}
      </span>
      <div className="flex items-center gap-2 text-xs text-ink-muted">
        {business.verified ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-indigo/20 bg-indigo/[.10] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-indigo">
            <Check className="size-3" aria-hidden="true" strokeWidth={2.4} />
            Verified
          </span>
        ) : null}
        {business.city ? <span>{business.city}</span> : null}
      </div>
    </div>
  );
}
