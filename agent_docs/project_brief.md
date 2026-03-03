# Project Brief (Persistent) — Chicago Desi Wedding Vendor Marketplace

## Product Vision

A web-based marketplace enabling Chicago-area Desi wedding couples to discover, compare, and request bookings from verified vendors using AI-assisted search and a hold-deposit flow. Launch before May 2026 wedding season.

## Problem Statement

Vendors are fragmented across Instagram, WhatsApp, and word-of-mouth. Couples struggle to compare vendors, get timely responses, and secure commitments without logistical chaos. No centralized, structured, trustworthy platform exists tailored to Chicago Desi weddings for fast vendor discovery and commitment.

## Target Market

- **Primary:** Chicago-based South Asian (Desi) couples planning weddings
- **Geography:** Chicago metro area (expandable later)
- **Vendor categories (good for V1 — more standardized):** photo booth/add-ons, basic DJ packages, henna/mehndi, hair/makeup, invitations/print, desserts, photography, videography
- **Vendor categories (bad for V1 — negotiation-heavy):** venues, catering, large decor/floral, full planners, multi-event bundles

## Success Metrics

| Timeframe                | Target                |
| ------------------------ | --------------------- |
| 30 days post-launch      | 3 completed bookings  |
| 90 days post-launch      | 50 completed bookings |
| Search response time     | < 2 seconds           |
| Vendor profile load time | < 2 seconds           |
| Monthly operating costs  | ~$250 or less         |

## Conversion Funnel Targets

| Metric                      | Target | Red Flag |
| --------------------------- | ------ | -------- |
| Request → Quote Rate        | > 60%  | < 40%    |
| Quote → Deposit Rate        | > 30%  | < 15%    |
| Deposit → Confirmation Rate | > 90%  | < 70%    |
| Suspected Backdooring       | < 10%  | > 30%    |

## Coding Conventions

- **Language:** TypeScript (strict mode) — `any` type is forbidden
- **Framework:** Next.js 14 App Router with server components
- **Styling:** Tailwind CSS (mobile-first)
- **Validation:** Zod for all API inputs and forms
- **Architecture:** Route handlers → Service layer → Data layer (Supabase)
- **Money:** All prices stored in cents (integers, never floats)
- **Database:** snake_case columns, UUIDs for primary keys, RLS on all tables
- **Components:** PascalCase filenames, functional components only
- **API:** RESTful conventions, Supabase JWT auth, Zod input validation
- **State management:** Server components for data fetching (no useEffect for data)
- **Error handling:** `tryCatch` wrapper pattern, never swallow errors silently

## Quality Gates

- **Pre-commit hooks:** ESLint + Prettier + TypeScript type-check
- **No skipping:** All hooks must pass before any commit
- **Tests:** Unit tests for service layer; E2E for critical booking flow
- **Code review:** AI generates, human reviews and tests
- **Database changes:** Always via migration files (`supabase/migrations/`)
- **Type generation:** Run `npx supabase gen types typescript` after every schema change

## Key Commands

```bash
npm run dev          # Start Next.js dev server (port 3000)
npm run build        # Production build
npm run lint         # ESLint check
npm run typecheck    # TypeScript type check (tsc --noEmit)
npm test             # Run test suite
npx supabase start   # Start local Supabase
npx supabase db push # Push migrations to remote Supabase
npx supabase gen types typescript --local > src/types/database.types.ts  # Regenerate types
```

## Key Decisions (Do Not Revisit)

1. **Request-to-book, NOT instant booking** — Weddings are not standardized inventory
2. **Stripe Connect Standard** — Stripe handles onboarding; no custom KYC flows
3. **pgvector in Supabase** — $0 vs Pinecone $70/month; good enough for MVP
4. **Cloudflare R2** — Zero egress fees; better than S3 for image-heavy platform
5. **No vendor CRM / no in-app chat / no contracts** — Cut from MVP scope
6. **Contact reveal only after deposit** — Core anti-backdooring mechanism

## Update Cadence

- Update `AGENTS.md` current state after completing each phase
- Update `agent_docs/` files when adding new libraries, patterns, or conventions
- Regenerate `database.types.ts` after every schema change
- Review and update this brief at the start of each new phase
