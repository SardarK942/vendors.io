'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronsUpDown, LogOut, User as UserIcon } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Props {
  user: { email: string; initial: string; name?: string };
}

export function SidebarUserMenu({ user }: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  // Prefer the real display name when we have it; otherwise fall back to the
  // email local part (Figma two-line chip: name over email).
  const displayName = user.name?.trim() || user.email.split('@')[0] || user.email;
  const initial = (user.name?.trim()?.[0] ?? user.initial).toUpperCase();

  async function handleLogout() {
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.push('/login');
      router.refresh();
    } catch {
      toast.error('Log out failed, please try again.');
      setBusy(false);
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="gap-2 data-[state=open]:bg-indigo/5"
              aria-label="Open account menu"
            >
              <span className="grid size-[34px] shrink-0 place-items-center rounded-full bg-indigo/10 font-sans text-sm font-semibold text-indigo">
                {initial}
              </span>
              <span className="flex min-w-0 flex-col overflow-hidden text-left leading-tight">
                <span className="truncate text-[11px] font-semibold capitalize text-ink">
                  {displayName}
                </span>
                <span className="truncate text-[9px] text-ink-soft">{user.email}</span>
              </span>
              <ChevronsUpDown
                className="ml-auto size-3 shrink-0 text-ink-soft"
                aria-hidden="true"
              />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="w-56">
            <DropdownMenuItem asChild>
              <Link href="/dashboard/profile" className="flex items-center gap-2">
                <UserIcon className="size-4" aria-hidden="true" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              disabled={busy}
              className="text-hot-pink focus:text-hot-pink"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
