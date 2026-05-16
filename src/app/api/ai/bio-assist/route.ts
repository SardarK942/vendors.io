import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/api/auth';
import { getAnthropic } from '@/lib/ai/anthropic';
import { BIO_DRAFT_SYSTEM, BIO_POLISH_SYSTEM, bioDraftUserPrompt, bioPolishUserPrompt } from '@/lib/ai/prompts';
import { checkAndIncrement } from '@/lib/ai/rate-limit';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  businessName: z.string().min(1),
  category: z.string().min(1),
  instagramHandle: z.string().optional(),
  draft: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let user;
  try {
    ({ user } = await requireUser());
  } catch {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { data: userRow } = await createServiceRoleClient()
    .from('users').select('role').eq('id', user.id).single();
  if (userRow?.role !== 'vendor') {
    return new Response(JSON.stringify({ error: 'Vendors only' }), { status: 403 });
  }

  const rate = await checkAndIncrement(createServiceRoleClient(), user.id);
  if (!rate.allowed) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded', resetAt: rate.resetAt.toISOString() }),
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rate.resetAt.getTime() - Date.now()) / 1000)) } }
    );
  }

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return new Response(JSON.stringify({ error: 'Invalid input' }), { status: 400 });

  const { businessName, category, instagramHandle, draft } = parsed.data;
  const usePolish = draft && draft.trim().length >= 20;
  const system = usePolish ? BIO_POLISH_SYSTEM : BIO_DRAFT_SYSTEM;
  const userPrompt = usePolish
    ? bioPolishUserPrompt({ businessName, category, draft: draft! })
    : bioDraftUserPrompt({ businessName, category, instagramHandle });

  try {
    const anthropic = getAnthropic();
    const stream = anthropic.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
          controller.close();
        } catch (err) {
          logger.error('bio-assist stream error', err, { user_id: user.id });
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`));
          controller.close();
        }
      },
    });
    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    logger.error('bio-assist setup error', err, { user_id: user.id });
    return new Response(JSON.stringify({ error: 'AI service unavailable' }), { status: 503 });
  }
}
