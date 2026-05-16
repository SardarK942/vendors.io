import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_CALLS = 10;

export interface RateLimitCheck {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export async function checkAndIncrement(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<RateLimitCheck> {
  const { data: row } = await supabase
    .from('ai_bio_assist_calls')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  const now = Date.now();
  const windowStart = row ? new Date(row.window_started_at).getTime() : 0;
  const windowExpired = now - windowStart > WINDOW_MS;

  if (!row || windowExpired) {
    await supabase.from('ai_bio_assist_calls').upsert({
      user_id: userId, calls_in_window: 1, window_started_at: new Date(now).toISOString(),
    });
    return { allowed: true, remaining: MAX_CALLS - 1, resetAt: new Date(now + WINDOW_MS) };
  }

  if (row.calls_in_window >= MAX_CALLS) {
    return { allowed: false, remaining: 0, resetAt: new Date(windowStart + WINDOW_MS) };
  }

  await supabase
    .from('ai_bio_assist_calls')
    .update({ calls_in_window: row.calls_in_window + 1 })
    .eq('user_id', userId);
  return {
    allowed: true,
    remaining: MAX_CALLS - row.calls_in_window - 1,
    resetAt: new Date(windowStart + WINDOW_MS),
  };
}
