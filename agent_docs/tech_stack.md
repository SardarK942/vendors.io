# Tech Stack & Tools — Chicago Desi Wedding Vendor Marketplace

## Core Stack

| Component      | Technology                                    | Version / Tier  | Reasoning                                                                          |
| -------------- | --------------------------------------------- | --------------- | ---------------------------------------------------------------------------------- |
| **Frontend**   | Next.js 14 (App Router)                       | 14.x            | Server components, built-in API routes, Vercel deployment                          |
| **Backend**    | Supabase (Postgres + Auth + Edge Functions)   | Free tier → Pro | Row-level security, real-time subscriptions, cost-effective                        |
| **Database**   | PostgreSQL + pgvector                         | Postgres 15+    | Relational data for weddings; pgvector for semantic search ($0 vs Pinecone $70/mo) |
| **Payments**   | Stripe Connect (Standard)                     | Latest          | Marketplace payments with platform fee; Stripe handles vendor KYC/onboarding       |
| **AI Search**  | OpenAI (text-embedding-3-small + GPT-4o mini) | Latest          | Semantic search under budget (~$17/month estimated)                                |
| **Email**      | Resend                                        | Free → $20/mo   | 99¢/month for 3,000 emails; excellent DX                                           |
| **Storage**    | Cloudflare R2                                 | Free tier       | Zero egress fees, S3-compatible API ($0.015/GB storage)                            |
| **Hosting**    | Vercel (Hobby Plan)                           | $20/month       | Generous limits; native Next.js integration                                        |
| **Analytics**  | Vercel Analytics + PostHog                    | Free tiers      | MVP metrics tracking                                                               |
| **Automation** | n8n (self-hosted)                             | Free            | Workflow automation for reminders, analytics                                       |
| **Language**   | TypeScript                                    | 5.x             | Strict mode enabled                                                                |
| **Styling**    | Tailwind CSS                                  | 3.x             | Mobile-first utility classes                                                       |
| **Validation** | Zod                                           | Latest          | Runtime validation for API inputs and forms                                        |

## Budget Breakdown (~$250/month)

| Service                               | Estimated Cost                                |
| ------------------------------------- | --------------------------------------------- |
| Vercel Hobby Plan                     | $20/mo                                        |
| Supabase (Free → Pro)                 | $0–25/mo                                      |
| Stripe fees                           | 2.9% + 30¢ per transaction (pass-through)     |
| OpenAI API (embeddings + GPT-4o mini) | ~$17/mo                                       |
| Resend                                | $0.99/mo                                      |
| Cloudflare R2                         | ~$0–5/mo                                      |
| n8n (self-hosted)                     | $0                                            |
| **Total**                             | **~$63–68/mo fixed + Stripe per-transaction** |

## Setup Commands

```bash
# 1. Initialize Next.js 14 project
npx create-next-app@14 vendors-io --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"

# 2. Install core dependencies
npm install @supabase/supabase-js @supabase/ssr stripe @stripe/stripe-js zod resend
npm install openai

# 3. Install dev dependencies
npm install -D supabase prettier eslint-config-prettier husky lint-staged @types/node

# 4. Initialize Supabase locally
npx supabase init
npx supabase start

# 5. Generate database types
npx supabase gen types typescript --local > src/types/database.types.ts

# 6. Setup Husky pre-commit hooks
npx husky init
echo "npx lint-staged" > .husky/pre-commit

# 7. Start development server
npm run dev
```

## Environment Variables

```bash
# .env.local (Development) — NEVER commit this file

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# OpenAI
OPENAI_API_KEY=sk-...

# Resend
RESEND_API_KEY=re_...

# Cloudflare R2
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=wedding-marketplace

# App Config
NEXT_PUBLIC_APP_URL=http://localhost:3000
PLATFORM_FEE_PERCENTAGE=10
```

## Project Structure (Target)

```
vendors.io/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── signup/page.tsx
│   │   │   └── layout.tsx
│   │   ├── (marketplace)/
│   │   │   ├── page.tsx                    # Homepage with AI search bar
│   │   │   ├── vendors/
│   │   │   │   ├── page.tsx                # Listing page with filters
│   │   │   │   └── [slug]/page.tsx         # Vendor detail (SSR for SEO)
│   │   │   └── layout.tsx
│   │   ├── dashboard/
│   │   │   ├── page.tsx                    # Role-based dashboard
│   │   │   ├── bookings/page.tsx           # Booking requests list
│   │   │   ├── profile/page.tsx            # Vendor profile management
│   │   │   └── stripe/
│   │   │       ├── success/page.tsx        # Stripe onboarding success
│   │   │       └── refresh/page.tsx        # Stripe onboarding refresh
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ├── signup/route.ts
│   │   │   │   ├── login/route.ts
│   │   │   │   └── logout/route.ts
│   │   │   ├── vendors/
│   │   │   │   ├── route.ts                # GET: search vendors
│   │   │   │   ├── [slug]/route.ts         # GET: single vendor
│   │   │   │   └── claim/route.ts          # POST: claim vendor profile
│   │   │   ├── bookings/
│   │   │   │   ├── request/route.ts        # POST: create booking request
│   │   │   │   ├── requests/route.ts       # GET: list user's requests
│   │   │   │   └── [id]/
│   │   │   │       ├── quote/route.ts      # PUT: vendor submits quote
│   │   │   │       └── deposit/route.ts    # POST: create Stripe checkout
│   │   │   ├── webhooks/
│   │   │   │   └── stripe/route.ts         # POST: Stripe webhook handler
│   │   │   └── ai/
│   │   │       ├── embed/route.ts          # POST: generate embeddings (admin)
│   │   │       └── search/route.ts         # POST: semantic search
│   │   ├── layout.tsx                      # Root layout
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/                             # Reusable UI components
│   │   ├── forms/                          # Form components
│   │   ├── marketplace/                    # Marketplace-specific components
│   │   └── dashboard/                      # Dashboard-specific components
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts                   # Browser Supabase client
│   │   │   ├── server.ts                   # Server Supabase client
│   │   │   └── middleware.ts               # Auth middleware
│   │   ├── stripe/
│   │   │   ├── client.ts                   # Stripe server client
│   │   │   └── connect.ts                  # Connect account helpers
│   │   ├── ai/
│   │   │   ├── embeddings.ts               # OpenAI embedding generation
│   │   │   └── search.ts                   # Semantic search logic
│   │   ├── email/
│   │   │   └── resend.ts                   # Email sending helpers
│   │   └── utils.ts                        # Shared utilities
│   ├── services/
│   │   ├── vendor.service.ts               # Vendor business logic
│   │   ├── booking.service.ts              # Booking state machine logic
│   │   └── payment.service.ts              # Stripe payment logic
│   ├── types/
│   │   ├── database.types.ts               # Auto-generated from Supabase
│   │   └── index.ts                        # App-level type definitions
│   └── middleware.ts                       # Next.js middleware (auth redirect)
├── supabase/
│   ├── migrations/                         # SQL migration files
│   ├── seed.sql                            # Seed data for development
│   └── config.toml                         # Supabase local config
├── public/
│   └── images/                             # Static assets
├── agent_docs/                             # AI agent documentation
├── docs/                                   # Project documentation (PRD, TDD)
├── AGENTS.md                               # Master plan (this file's parent)
├── .cursorrules                            # Cursor IDE config
├── .env.local                              # Environment variables (git-ignored)
├── .eslintrc.json                          # ESLint config
├── .prettierrc                             # Prettier config
├── tailwind.config.ts                      # Tailwind config
├── tsconfig.json                           # TypeScript config
├── next.config.js                          # Next.js config
└── package.json
```

## Key Architectural Decisions

| Decision                             | Chosen          | Rationale                                                                            | Alternative Considered                                     |
| ------------------------------------ | --------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Next.js App Router over Pages Router | App Router      | Server components reduce client JS, better SEO, simpler data fetching                | Pages Router (more mature but less performant)             |
| Supabase over Firebase               | Supabase        | Postgres > NoSQL for relational wedding data; RLS is more powerful                   | Firebase (vendor lock-in, weaker querying)                 |
| Stripe Connect Standard over Express | Standard        | Stripe handles onboarding UI, compliance; lower dev cost                             | Express (more control but higher dev cost)                 |
| pgvector over Pinecone               | pgvector        | Self-hosted in Supabase, $0 vs $70/month                                             | Pinecone (managed but expensive for MVP)                   |
| Cloudflare R2 over AWS S3            | R2              | Zero egress fees, S3-compatible API, cheaper storage                                 | S3 (vendor lock-in, egress costs)                          |
| Request-to-book over Instant booking | Request-to-book | Weddings are not standardized inventory; vendor confirmation prevents double-booking | Instant booking (fails operationally for complex services) |

## Supabase Client Setup Examples

### Browser Client (for client components)

```typescript
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database.types';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

### Server Client (for server components and API routes)

```typescript
// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database.types';

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );
}
```

### Stripe Server Client

```typescript
// src/lib/stripe/client.ts
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
  typescript: true,
});
```
