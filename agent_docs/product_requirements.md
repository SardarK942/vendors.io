# Product Requirements — Chicago Desi Wedding Vendor Marketplace MVP

## Product Overview

**Name:** Chicago Desi Wedding Vendor Marketplace
**One-Line Description:** A web-based marketplace enabling Chicago-area Desi wedding couples to discover, compare, and request bookings from verified vendors using AI-assisted search and a hold-deposit flow.
**Primary Objective:** Generate completed vendor bookings through the platform.

## Target Users

**Primary Persona:** Chicago-based Desi couples planning weddings.
**Needs:** Fast discovery, visual proof, comparable pricing, responsiveness signal, simple commitment flow.

## Core User Flow

1. User lands on homepage with AI search bar
2. Searches or browses categories
3. Views vendor profiles with pricing and media
4. Submits structured booking request
5. Vendor responds with quote
6. User pays hold deposit
7. Booking confirmed, contact info revealed

---

## MVP Feature Scope (P0 — Must-Have)

### 1. Authentication

- Couple, Vendor, Admin roles via Supabase Auth
- Email/password + magic link login
- Role-based access control enforced by Supabase RLS

### 2. Vendor Claim + Profile Management

- Pre-seeded vendor profiles that vendors can claim
- Profile fields: business name, slug, category, bio, service area, starting price range, portfolio images, Instagram handle, website URL
- Verification badge system (admin-controlled)
- Response SLA tracking (default 48 hours)

### 3. Marketplace Listing with Filters and AI Search

- Category browsing (photography, videography, mehndi, hair_makeup, dj, photobooth, catering, venue, decor, invitations)
- Filter by: category, price range, service area
- AI semantic search: natural language query → GPT-4o mini parses intent → embedding → pgvector similarity search
- Full-text search fallback if semantic results < 5
- Search response time < 2 seconds

### 4. Request-to-Book System

- Structured booking request form: event date, event type (engagement, mehndi, sangeet, wedding, reception, multiple), guest count, budget range, special requests
- 72-hour vendor response window (auto-expire if no response)
- Vendor submits quote with amount + notes
- Quote validity: 7 days
- Booking state machine: pending → quoted → deposit_paid → confirmed (with expired/declined/cancelled branches)

### 5. Stripe Hold Deposit via Stripe Connect

- Stripe Connect Standard accounts for vendors
- Platform fee: 5–10% via destination charges with application_fee_amount
- Hold deposit: $50 or 10% of quote (whichever is less)
- Deposit authorized but NOT captured immediately
- Auto-refund on vendor decline or no-confirmation within 7 days
- Contact reveal ONLY after deposit payment (anti-backdooring)

### 6. Email Notifications via Resend

- Booking request received (to vendor)
- Quote submitted (to couple)
- Deposit paid / booking confirmed (to both)
- Request expired (to both)
- Vendor onboarding reminders

---

## Nice-to-Have (V1.1 — After MVP Validation)

- Verified Booking Badge for vendors who complete on-platform bookings
- Auto-invoicing and professional receipts
- Dispute protection ("If vendor no-shows, we refund + find replacement")
- Calendar reminders ("Your mehndi artist arrives in 3 days!")
- Side-by-side quote comparison view
- n8n workflow automation for marketing
- PostHog analytics dashboard

## Explicit Cuts — NOT in MVP

- **Instant booking** for complex categories
- **Real-time calendar sync** as source of truth
- **Full contract/e-sign** system
- **Rich review/rating system** at launch
- **Vendor CRM replacement**
- **Heavy in-platform chat** policing
- **Multi-city expansion** (Chicago only for MVP)
- **Native mobile app** (web-first, responsive)

---

## Non-Functional Requirements

- All pages load in < 2 seconds on 4G connection
- Stripe handles PCI compliance
- Supabase RLS enforces data isolation between users
- Minimal PII storage (only what's necessary for bookings)
- Chicago-only dataset (expandable later)
- Architecture supports 500+ vendors, 10,000+ couples (far beyond MVP)
- Mobile-first: responsive design, 70% of traffic expected on mobile
- SEO: server-side rendering for vendor profiles, structured data markup

## UI/UX Requirements

- **Design vibe:** Clean, modern, trustworthy — not cluttered like WeddingWire
- **Mobile-first:** 70% of traffic expected from mobile devices
- **Key trust signals:** Verified badges, real booking proof, transparent deposit/refund terms, response SLA display
- **Avoid churn drivers:** No lead-form black holes, pricing must be comparable, availability must be clear, no fear of scams

## User Trust Signals (Critical for Adoption)

- Verified identity badges for vendors
- Real booking proof badges
- Crystal-clear deposit/refund terms displayed prominently
- Response SLA visible on vendor profiles
- Community/referral graph (future)

---

## Top Risks and Mitigations

| Risk                               | Impact                         | Mitigation                                                                                 |
| ---------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------ |
| Low vendor response rate           | Couples churn immediately      | Response SLA + ranking boost; auto-expire slow vendors; show backup vendors                |
| Fake/low-intent demand             | Vendors stop trusting platform | Couple phone verification; throttling; quality scoring                                     |
| Off-platform leakage (backdooring) | Lost revenue and signal        | Contact reveal only after deposit; make platform valuable (receipts, badges, dispute help) |
| Availability mismatch              | Refund chaos; reputation hit   | Request-to-book + vendor confirm required before capture/payout                            |
| Trust deficit (new brand)          | Nobody pays deposits           | Verified vendors + transparent refund terms + small hold deposits                          |

---

## Definition of Done (MVP)

- [ ] All P0 features implemented and working
- [ ] End-to-end booking flow works (request → quote → deposit → confirm)
- [ ] Stripe payments confirmed in test and live mode
- [ ] Email triggers verified for all booking states
- [ ] Responsive on desktop + mobile (iPhone + Android tested)
- [ ] 20+ real vendor profiles seeded
- [ ] 3 real bookings completed
- [ ] Search < 2 seconds, profile load < 2 seconds
- [ ] Pre-commit hooks passing (lint + typecheck)

## Timeline

- **Duration:** 10 weeks (Feb 17 – Apr 27, 2026)
- **Time commitment:** 10–20 hours/week (human) + AI assistance via Cursor IDE
- **Launch target:** Before May 2026 wedding season
- **Go/No-Go (end of Week 9):** Complete booking flow, working webhooks, 15+ vendors, mobile responsive, emails sending
