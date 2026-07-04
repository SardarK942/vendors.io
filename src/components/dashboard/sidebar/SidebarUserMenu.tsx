'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronUp, LogOut, User as UserIcon } from 'lucide-react';
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
  user: { email: string; initial: string };
}

export function SidebarUserMenu({ user }: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

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
              className="data-[state=open]:bg-sidebar-accent/10"
              aria-label="Open account menu"
            >
              <span className="grid size-8 place-items-center rounded-full bg-indigo font-serif text-sm font-medium text-cream">
                {user.initial}
              </span>
              <span className="flex flex-col overflow-hidden text-left leading-tight">
                <span className="truncate text-sm font-semibold text-ink">{user.email}</span>
              </span>
              <ChevronUp className="ml-auto size-4 text-ink-soft" aria-hidden="true" />
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
