import { NextRequest, NextResponse } from 'next/server';

// `src/app/dashboard/layout.tsx` forces the sidebar shell on everything under
// /dashboard (SidebarProvider/SidebarInset, no per-route opt-out). The
// event-creation wizard needs a full-screen canvas, so it actually lives at
// `src/app/(wizard)/events/new/page.tsx`. This redirect keeps the intuitive
// /dashboard/events/new URL working (e.g. old links, muscle memory) by
// bouncing to the real route. See .superpowers/sdd/task-9-report.md for the
// route-placement rationale.
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/events/new', request.url), 307);
}
