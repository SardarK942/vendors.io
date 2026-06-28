// src/components/dashboard/BusinessSwitcher.tsx
//
// Sub-project I §3. Topbar pill rendered conditionally when totalCount > 1.
// Clicking a non-active business updates users.active_vendor_profile_id and
// triggers a server-component refresh.
'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Building2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface SwitcherBusiness {
  id: string;
  businessName: string;
}

interface BusinessSwitcherProps {
  activeBusinessId: string;
  businesses: SwitcherBusiness[];
}

export function BusinessSwitcher({ activeBusinessId, businesses }: BusinessSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const active = businesses.find((b) => b.id === activeBusinessId);

  const switchTo = async (vendorProfileId: string) => {
    if (vendorProfileId === activeBusinessId) {
      setOpen(false);
      return;
    }
    const res = await fetch('/api/users/me/active-business', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorProfileId }),
    });
    if (!res.ok) {
      console.error('[switcher] failed to switch business', res.status);
      return;
    }
    setOpen(false);
    startTransition(() => router.refresh());
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
          disabled={isPending}
        >
          <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="max-w-[180px] truncate" translate="no">
            {active?.businessName ?? 'Switch business'}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
          Your businesses
        </DropdownMenuLabel>
        {businesses.map((b) => (
          <DropdownMenuItem
            key={b.id}
            onClick={() => switchTo(b.id)}
            className="flex items-center justify-between"
          >
            <span className="truncate" translate="no">
              {b.businessName}
            </span>
            {b.id === activeBusinessId && (
              <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/profile/setup?next=true">Add another business</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
