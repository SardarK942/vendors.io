// src/components/dashboard/BusinessSwitcher.tsx
//
// Sub-project I §3. Topbar pill rendered conditionally when totalCount > 1.
// Clicking a non-active business updates users.active_vendor_profile_id and
// triggers a server-component refresh.
'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Building2, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';

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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label="Switch business"
          className="flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream disabled:opacity-50"
          disabled={isPending}
        >
          <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="max-w-[180px] truncate" translate="no">
            {active?.businessName ?? 'Switch business'}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        <Command label="Your businesses">
          <CommandInput placeholder="Search businesses…" />
          <CommandList>
            <CommandEmpty>No businesses match.</CommandEmpty>
            <CommandGroup heading="Your businesses">
              {businesses.map((b) => (
                <CommandItem
                  key={b.id}
                  value={b.businessName}
                  onSelect={() => switchTo(b.id)}
                  className="flex items-center justify-between"
                >
                  <span className="truncate" translate="no">
                    {b.businessName}
                  </span>
                  {b.id === activeBusinessId && (
                    <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              {/* The "Add" affordance is a navigation, not a selectable command —
                  so we wrap a Link inside a CommandItem and stop the cmdk select
                  cycle from firing fetch logic. */}
              <CommandItem asChild>
                <Link href="/dashboard/profile/setup?next=true" className="flex items-center gap-2">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add another business
                </Link>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
