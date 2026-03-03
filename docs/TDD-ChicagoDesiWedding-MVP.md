# Technical Design Document — Chicago Desi Wedding Vendor Marketplace

# MVP Implementation Guide | Version 1.0 | February 2026

> This is a reference copy. The full TDD is the source of truth for database schemas,
> API endpoints, Stripe integration details, and the 10-week implementation roadmap.
> See the original PDF for complete details.

## Quick Reference

### Database Tables

- `users` — User profiles with role (couple/vendor/admin), extends Supabase auth.users
- `vendor_profiles` — Business details, portfolio, pricing, verification, embedding vector
- `booking_requests` — Booking state machine (pending → quoted → deposit_paid → confirmed)
- `stripe_accounts` — Vendor Stripe Connect account status
- `transactions` — Payment records

### API Endpoints

| Method | Endpoint                   | Description     | Auth       |
| ------ | -------------------------- | --------------- | ---------- |
| POST   | /api/auth/signup           | Create account  | No         |
| POST   | /api/auth/login            | Login           | No         |
| POST   | /api/auth/logout           | Logout          | Yes        |
| GET    | /api/vendors               | Search vendors  | No         |
| GET    | /api/vendors/[slug]        | Vendor profile  | No         |
| POST   | /api/vendors/claim         | Claim profile   | Vendor     |
| PUT    | /api/vendors/[id]          | Update profile  | Vendor     |
| POST   | /api/bookings/request      | Create request  | Couple     |
| GET    | /api/bookings/requests     | List requests   | Yes        |
| PUT    | /api/bookings/[id]/quote   | Submit quote    | Vendor     |
| POST   | /api/bookings/[id]/deposit | Stripe checkout | Couple     |
| POST   | /api/webhooks/stripe       | Stripe webhook  | Stripe sig |
| POST   | /api/ai/embed              | Gen embeddings  | Admin      |
| POST   | /api/ai/search             | Semantic search | No         |

### Booking State Machine

```
pending → quoted → deposit_paid → confirmed
  ↓         ↓          ↓
expired  declined   cancelled
```

### Key Business Rules

- 72-hour vendor response window (auto-expire)
- 7-day quote validity
- 7-day Stripe deposit hold (auto-refund if vendor doesn't confirm)
- Contact reveal ONLY after deposit payment
- Platform fee: 5-10% via Stripe destination charges

### 10-Week Roadmap Summary

| Weeks | Focus                                                     |
| ----- | --------------------------------------------------------- |
| 1-2   | Foundation (Next.js, Supabase, Auth, Stripe test account) |
| 3     | Vendor Profiles (CRUD, R2 upload, claim flow)             |
| 4     | Marketplace Search (listing, filters, text search)        |
| 5     | AI Search (embeddings, pgvector, semantic API)            |
| 6     | Booking Flow P1 (requests, quotes, emails)                |
| 7     | Stripe Connect (onboarding, webhooks)                     |
| 8     | Booking Flow P2 (checkout, payments, contact reveal)      |
| 9     | Testing & Refinement (E2E, mobile, performance)           |
| 10    | Launch Prep (seed vendors, beta test, deploy)             |
