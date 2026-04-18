import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { logger } from '@/lib/logger';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

function newRequestId(): string {
  return `req_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

/**
 * Wraps a route handler so any thrown error is converted to a JSON response.
 * Without this, an uncaught throw returns an empty body + 500 HTML, breaking
 * clients that call .json() on the response.
 *
 * Usage:
 *   export const POST = withErrorBoundary(async (request, ctx) => { ... });
 */
export function withErrorBoundary<Args extends unknown[], R extends Response | NextResponse>(
  handler: (...args: Args) => Promise<R>
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    const requestId = newRequestId();
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json(
          { error: err.message, details: err.details, requestId },
          { status: err.status }
        );
      }

      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: 'Validation failed', details: err.flatten(), requestId },
          { status: 400 }
        );
      }

      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('unhandled route error', err, { requestId });
      return NextResponse.json({ error: message, requestId }, { status: 500 });
    }
  };
}
