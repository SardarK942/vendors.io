# Essential Resources — Chicago Desi Wedding Vendor Marketplace

## Curated Repositories

| Repository                          | Purpose                                   | URL                                               |
| ----------------------------------- | ----------------------------------------- | ------------------------------------------------- |
| **PatrickJS/awesome-cursorrules**   | Anti-vibe rule templates for Cursor       | github.com/PatrickJS/awesome-cursorrules          |
| **OneRedOak/claude-code-workflows** | Review workflow packs for Claude          | github.com/OneRedOak/claude-code-workflows        |
| **matebenyovszky/healing-agent**    | Self-healing Python patterns              | github.com/matebenyovszky/healing-agent           |
| **modelcontextprotocol/servers**    | MCP server implementations                | github.com/modelcontextprotocol/servers           |
| **vercel/next.js/examples**         | Official Next.js 14 examples (App Router) | github.com/vercel/next.js/tree/canary/examples    |
| **supabase/supabase/examples**      | Supabase integration examples             | github.com/supabase/supabase/tree/master/examples |

## Key Documentation

| Topic                          | URL                                              | When to Reference                                   |
| ------------------------------ | ------------------------------------------------ | --------------------------------------------------- |
| **Next.js 14 App Router**      | nextjs.org/docs/app                              | Page/layout creation, server components, API routes |
| **Supabase JavaScript Client** | supabase.com/docs/reference/javascript           | Database queries, auth, RLS                         |
| **Supabase Auth with Next.js** | supabase.com/docs/guides/auth/server-side/nextjs | SSR auth setup, middleware                          |
| **Stripe Connect Standard**    | docs.stripe.com/connect/standard-accounts        | Vendor onboarding, account links                    |
| **Stripe Checkout**            | docs.stripe.com/payments/checkout                | Payment session creation                            |
| **Stripe Webhooks**            | docs.stripe.com/webhooks                         | Event handling, signature verification              |
| **OpenAI Embeddings**          | platform.openai.com/docs/guides/embeddings       | text-embedding-3-small usage                        |
| **pgvector**                   | github.com/pgvector/pgvector                     | Vector similarity search in Postgres                |
| **Supabase pgvector Guide**    | supabase.com/docs/guides/ai/vector-columns       | Storing and querying embeddings                     |
| **Resend with Next.js**        | resend.com/docs/send-with-nextjs                 | Email sending from API routes                       |
| **Cloudflare R2**              | developers.cloudflare.com/r2                     | Object storage for images                           |
| **Tailwind CSS**               | tailwindcss.com/docs                             | Utility-first styling                               |
| **Zod**                        | zod.dev                                          | Schema validation                                   |
| **Vitest**                     | vitest.dev/guide                                 | Unit/integration testing                            |
| **Playwright**                 | playwright.dev/docs                              | E2E browser testing                                 |
| **MCP Protocol**               | modelcontextprotocol.io                          | AI tool integration                                 |

## Stripe Test Cards

| Card Number           | Scenario                          |
| --------------------- | --------------------------------- |
| `4242 4242 4242 4242` | Successful payment                |
| `4000 0000 0000 0002` | Card declined                     |
| `4000 0000 0000 3220` | 3D Secure authentication required |
| `4000 0000 0000 9995` | Insufficient funds                |

Use any future expiry date, any 3-digit CVC, any ZIP code.

## Competitive Intelligence (From Research)

### What to Steal (Do)

| Platform               | Steal This                                              |
| ---------------------- | ------------------------------------------------------- |
| The Knot / WeddingWire | SEO taxonomy; content-driven acquisition                |
| Zola                   | Planning flow discipline; structured vendor info fields |
| Thumbtack              | Request intake + matching structure                     |
| HoneyBook              | Workflow primitives; language for proposals/invoices    |
| Instagram / TikTok     | Visual proof + tagging/referral loops                   |
| Airbnb                 | Identity + policy primitives                            |

### What NOT to Copy (Don't)

| Platform               | Don't Copy This                                        |
| ---------------------- | ------------------------------------------------------ |
| The Knot / WeddingWire | Pay-per-lead incentives that erode trust               |
| Zola                   | Pretending availability is real-time truth             |
| Thumbtack              | Charging per lead in weddings as core model            |
| HoneyBook              | Trying to replace vendor back office in V1             |
| Instagram              | Trying to replace social discovery (integrate instead) |
| Airbnb                 | Assuming instant booking works for complex services    |

## V1 Category Guidance

### Good for V1 (More Standardized)

- Photo booth / add-ons
- Basic DJ packages
- Henna / Mehndi
- Hair & Makeup
- Invitations / Print
- Desserts
- Photography
- Videography

### Bad for V1 (Negotiation-Heavy — Defer)

- Venues
- Catering
- Large decor / floral
- Full wedding planners
- Multi-event bundles

## Trust Signal Priority

1. Verified vendor identity badge
2. Real booking proof badges
3. Crystal-clear deposit/refund terms (displayed prominently)
4. Response SLA visible on profiles
5. Community/referral graph (future V2)

## Cost Tracking Reference

### Monthly AI Cost Estimate

| Item                | Calculation                               | Cost        |
| ------------------- | ----------------------------------------- | ----------- |
| Vendor embeddings   | 100 vendors × 500 tokens × $0.00002/1K    | $1.00       |
| Query embeddings    | 1,000 searches × 50 tokens × $0.00002/1K  | $1.00       |
| GPT-4o mini parsing | 1,000 searches × 100 tokens × $0.00015/1K | $15.00      |
| **Total AI**        |                                           | **~$17/mo** |

Set $50/month billing alert on OpenAI. If costs spike, cache more aggressively and fall back to full-text search.
