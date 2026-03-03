# AGENTS.md — Master Plan for Chicago Desi Wedding Vendor Marketplace

## Project Overview

**App:** Chicago Desi Wedding Vendor Marketplace (vendors.io)
**Goal:** A web-based marketplace enabling Chicago-area Desi wedding couples to discover, compare, and request bookings from verified vendors using AI-assisted search and a hold-deposit flow.
**Stack:** Next.js 14 (App Router) · Supabase (Postgres + Auth + Edge Functions) · Stripe Connect · OpenAI (Embeddings + GPT-4o mini) · Resend · Cloudflare R2 · Vercel
**Current Phase:** Phase 10 — Polish (All code complete)
**Timeline:** 10 weeks (Feb 17 – Apr 27, 2026) — Launch before May wedding season
**Budget:** ~$250/month operating costs

---

## How I Should Think

1. **Understand Intent First**: Before answering, identify what the user actually needs. Are they asking about UI, backend logic, deployment, or debugging?
2. **Ask If Unsure**: If critical information is missing (e.g., which table, which API route, which user role), ask ONE specific clarifying question before proceeding.
3. **Plan Before Coding**: Propose a brief plan and wait for approval before implementing. Never build multiple features at once.
4. **Verify After Changes**: Run tests/linters or manual checks after each change. Do not move forward when verification fails.
5. **Explain Trade-offs**: When recommending an approach, briefly mention what alternatives exist and why you chose this one.

## Plan → Execute → Verify (Required Workflow)

1. **Plan:** Outline a brief approach and ask for approval before coding. State which files will be created/modified.
2. **Plan Mode:** If supported (Cursor Plan Mode), use it for this step.
3. **Execute:** Implement one feature at a time. Keep changes small and reviewable.
4. **Verify:** Run `npm run lint`, `npm run typecheck`, or manual checks after each feature; fix before moving on.

---

## Context & Memory

- Treat `AGENTS.md` and `agent_docs/` as living docs. Update them as the project evolves.
- Use persistent tool configs (`.cursorrules`) for project rules.
- Update these files as the project scales (commands, conventions, constraints).
- **Load context on-demand**: Only read `agent_docs/` files when working on a relevant feature. Do not pre-load all docs.

## Optional Roles (If Supported)

- **Explorer:** Scan codebase or docs in parallel for relevant info (e.g., find all Stripe-related files).
- **Builder:** Implement features based on the approved plan.
- **Tester:** Run tests/linters and report failures.

## Testing & Verification

- Follow `agent_docs/testing.md` for test strategy.
- If no tests exist yet, propose minimal checks before proceeding.
- Do not move forward when verification fails.
- Run `npm run lint` and `npm run typecheck` after every change.

## Checkpoints & Pre-Commit Hooks

- Create git commits after milestones (each completed feature).
- Ensure pre-commit hooks pass before commits.
- Use conventional commit messages: `feat:`, `fix:`, `chore:`, `docs:`, `test:`.

---

## Context Files

Refer to these for details (load only when needed):

- `agent_docs/tech_stack.md` — Tech stack, libraries, versions, setup commands
- `agent_docs/code_patterns.md` — Code style, patterns, naming conventions, architecture rules
- `agent_docs/project_brief.md` — Persistent project rules, conventions, quality gates
- `agent_docs/product_requirements.md` — Full PRD with user stories, features, success metrics
- `agent_docs/testing.md` — Verification strategy, test commands, pre-commit hooks
- `agent_docs/resources.md` — Reference repositories, docs, and learning resources

---

## Current State (Update This!)

**Last Updated:** 2026-02-16
**Working On:** MVP code complete — all 10 phases implemented
**Completed:**

- Phase 1: Project scaffold, deps, shadcn/ui, Husky, lib files, types
- Phase 2: 7 SQL migrations, seed data, manual DB types
- Phase 3: Auth pages (login/signup), Supabase auth callback, Navbar/Footer, middleware
- Phase 4: Vendor service, API routes, Uploadthing, SSR vendor detail, dashboard
- Phase 5: Homepage hero, marketplace listing, filters, categories, search bar
- Phase 6: OpenAI embeddings, GPT-4o mini query parser, hybrid search API
- Phase 7: Booking state machine, request/quote/cancel APIs, Resend email
- Phase 8: Stripe Connect onboarding, deposit checkout, webhooks, contact reveal
- Phase 9: Vitest config, 36 unit tests passing, 22 vendor seed profiles
- Phase 10: Loading skeletons, error boundaries, 404 page, lint/typecheck clean
  **Next:** Set up external services (Supabase, Stripe, OpenAI, Resend, Uploadthing) and deploy
  **Recently Completed:** Documentation system created (AGENTS.md + agent_docs/)
  **Blocked By:** None

---

## Roadmap

### Phase 1: Foundation (Weeks 1–2 | Feb 17–28)

- [ ] Initialize Next.js 14 project with TypeScript + Tailwind CSS
- [ ] Setup Supabase project + database schema (users, vendor_profiles, booking_requests)
- [ ] Configure Supabase Auth (email/password + magic link)
- [ ] Create basic app structure: `/app/(auth)`, `/app/(marketplace)`, `/app/dashboard`
- [ ] Setup responsive layout with navbar
- [ ] Create Stripe test account
- [ ] Setup pre-commit hooks (ESLint + Prettier + TypeScript check)
- [ ] Environment variables setup (`.env.local`)

### Phase 2: Vendor Profiles (Week 3 | Mar 3–9)

- [ ] Create `vendor_profiles` table with RLS policies
- [ ] Build vendor profile page UI (portfolio, pricing, bio, service area)
- [ ] Implement Cloudflare R2 image upload for portfolio
- [ ] Build vendor claim flow (vendor claims pre-seeded profile)
- [ ] Add Zod validation for all vendor profile fields

### Phase 3: Marketplace Search (Week 4 | Mar 10–16)

- [ ] Build marketplace listing page with grid/list view
- [ ] Implement filter UI (category, price range, service area)
- [ ] Add Supabase full-text search (baseline)
- [ ] Build vendor detail page (SSR for SEO)
- [ ] Mobile-responsive marketplace layout

### Phase 4: AI Search Layer (Week 5 | Mar 17–23)

- [ ] Enable pgvector extension in Supabase
- [ ] Create `/lib/ai/embeddings.ts` with OpenAI text-embedding-3-small
- [ ] Build `search_vendors_semantic()` Postgres function
- [ ] Create API route `/api/ai/search` with query parsing (GPT-4o mini)
- [ ] Add caching layer for popular queries
- [ ] Implement two-tier search (semantic primary, full-text fallback)

### Phase 5: Booking Flow Part 1 (Week 6 | Mar 24–30)

- [ ] Create `booking_requests` table with state machine (pending → quoted → deposit_paid → confirmed)
- [ ] Build booking request form (event date, type, guest count, budget, special requests)
- [ ] Build vendor quote submission UI
- [ ] Implement 72-hour auto-expiration (cron job or Supabase Edge Function)
- [ ] Setup Resend email notifications (request received, quote submitted)

### Phase 6: Stripe Connect (Week 7 | Mar 31–Apr 6)

- [ ] Create `stripe_accounts` table
- [ ] Implement Stripe Connect Standard onboarding flow
- [ ] Build onboarding redirect pages (success/refresh)
- [ ] Handle `account.updated` webhook for onboarding completion
- [ ] Test with personal Stripe account

### Phase 7: Booking Flow Part 2 — Payments (Week 8 | Apr 7–13)

- [ ] Build Stripe Checkout session creation for hold deposits
- [ ] Implement payment intent with destination charges + platform fee (5–10%)
- [ ] Handle Stripe webhooks (payment_intent.succeeded, payment_intent.payment_failed)
- [ ] Implement contact reveal after deposit payment (anti-backdooring)
- [ ] Build booking confirmation flow

### Phase 8: Testing & Refinement (Week 9 | Apr 14–20)

- [ ] End-to-end booking flow test (full happy path)
- [ ] Edge case testing (expired requests, declined quotes, failed payments)
- [ ] Mobile responsiveness audit (iPhone + Android)
- [ ] Performance testing (search < 2s, profile load < 2s)
- [ ] Fix all critical bugs

### Phase 9: Launch Prep (Week 10 | Apr 21–27)

- [ ] Seed 20–30 real vendor profiles
- [ ] Beta test with 5 real couples
- [ ] Fix launch-blocking bugs
- [ ] Deploy to production (Vercel)
- [ ] Setup Vercel Analytics + PostHog
- [ ] Go/No-Go check: booking flow works, webhooks fire, 15+ vendors, mobile responsive, emails sending

---

## What NOT To Do

- Do NOT delete files without explicit confirmation
- Do NOT modify database schemas without a backup plan (migration file)
- Do NOT add features not in the current phase
- Do NOT skip tests for "simple" changes
- Do NOT bypass failing tests or pre-commit hooks
- Do NOT use deprecated libraries or patterns
- Do NOT build instant booking — use request-to-book only
- Do NOT build vendor CRM, in-app chat, contracts/e-sign, or review system (cut from MVP)
- Do NOT build real-time calendar sync (use vendor confirmation instead)
- Do NOT try to replace social discovery (integrate with Instagram instead)

## Engineering Constraints

### Type Safety (No Compromises)

- The `any` type is FORBIDDEN — use `unknown` with type guards
- All function parameters and returns must be typed
- Use Zod for runtime validation on all API inputs and form data
- Database types generated from Supabase CLI (`supabase gen types typescript`)

### Architectural Sovereignty

- Routes/API handlers handle request/response ONLY
- All business logic goes in `lib/` or `services/`
- No direct database calls from route handlers — use service functions
- Supabase RLS enforces data isolation; never trust client-side role checks alone

### Library Governance

- Check existing `package.json` before suggesting new dependencies
- Prefer native APIs over libraries (`fetch` over axios)
- No deprecated patterns (`useEffect` for data fetching → use server components or TanStack Query)
- All prices stored in cents (integers), never floating point

### The "No Apologies" Rule

- Do NOT apologize for errors — fix them immediately
- Do NOT generate filler text before providing solutions
- If context is missing, ask ONE specific clarifying question

### Workflow Discipline

- Pre-commit hooks must pass before commits
- If verification fails, fix issues before continuing
- One feature per PR; keep changes small and reviewable
