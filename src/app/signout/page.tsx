'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function SignOutPage() {
  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.signOut().finally(() => {
      window.location.href = '/';
    });
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream text-ink">
      <p className="text-sm uppercase tracking-[0.18em] text-ink/60">Signing you out…</p>
    </div>
  );
}
