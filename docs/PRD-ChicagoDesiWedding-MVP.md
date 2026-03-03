# Product Requirements Document (PRD)

# Chicago Desi Wedding Vendor Marketplace — MVP

## 1. Product Overview

**One-Line Description:** A web-based marketplace enabling Chicago-area Desi wedding couples to discover, compare, and request bookings from verified vendors using AI-assisted search and a hold-deposit flow.

**Primary Objective:** Generate completed vendor bookings through the platform.

**Non-Goals:** No instant booking, no vendor CRM, no in-app chat, no contracts/e-sign, no review system at launch.

## 2. Problem Statement

Vendors are fragmented across Instagram, WhatsApp, and word-of-mouth. Couples struggle to compare vendors, get timely responses, and secure commitments without logistical chaos.

**Core Problem:** No centralized, structured, trustworthy platform tailored to Chicago Desi weddings for fast vendor discovery and commitment.

## 3. Target Users

**Primary Persona:** Chicago-based Desi couples planning weddings.
**Needs:** Fast discovery, visual proof, comparable pricing, responsiveness signal, simple commitment flow.

## 4. Core User Flow

1. User lands on homepage with AI search bar
2. Searches or browses categories
3. Views vendor profiles with pricing and media
4. Submits structured booking request
5. Vendor responds
6. User pays hold deposit
7. Booking confirmed

## 5. MVP Feature Scope (P0)

- Authentication (Couple, Vendor, Admin roles via Supabase Auth)
- Vendor Claim + Profile Management
- Marketplace Listing with filters and AI search
- Request-to-Book system with expiration timer
- Stripe hold deposit via Stripe Connect
- Email notifications via Resend

## 6. Success Metrics

| Timeframe | Target                |
| --------- | --------------------- |
| 30 Days   | 3 completed bookings  |
| 90 Days   | 50 completed bookings |

## 7. Technical Stack

- Frontend: Next.js (Vercel)
- Backend: Supabase + Postgres + Edge Functions
- Payments: Stripe + Stripe Connect
- Email: Resend
- Storage: Cloudflare R2 / Uploadthing
- AI Search: Embeddings + lightweight LLM parsing
- Workflows: n8n (marketing automation)

## 8. Non-Functional Requirements

- Marketplace search < 2 seconds
- Vendor profile load < 2 seconds
- Stripe handles PCI compliance
- Minimal PII storage
- Chicago-only dataset (expandable later)

## 9. Definition of Done

- All P0 features implemented
- End-to-end booking flow works
- Stripe payments confirmed
- Email triggers verified
- Responsive on desktop + mobile
- 3 real bookings completed
