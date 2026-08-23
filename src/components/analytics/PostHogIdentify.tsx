'use client';
import { useEffect } from 'react';
import posthog from 'posthog-js';
import { createClient } from '@/lib/supabase/client';

export function PostHogIdentify() {
  useEffect(() => {
    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!posthog.__loaded) return;
      if (event === 'SIGNED_IN' && session?.user) {
        posthog.identify(session.user.id, {
          role: (session.user.user_metadata as { role?: string })?.role,
        });
      } else if (event === 'SIGNED_OUT') {
        posthog.reset();
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return null;
}
