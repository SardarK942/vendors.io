# Product

## Register

brand

## Users

**Primary (homepage + marketplace):** Newly engaged South Asian couples planning a wedding in Chicago. First-time visitors come in browsing, comparison-shopping, often overwhelmed by the wedding-planning surface area. They want to discover real vendors, compare specific packages with photos and prices, and not feel like they're on yet another generic directory or Indian-themed e-commerce site.

**Secondary (vendor-facing surfaces):** Wedding photographers, DJs, makeup artists, mehndi artists, decor teams. Mostly small-business operators (1–10 person shops) who want to be discovered, get inquiries, and run their booked work through one tool. They have their own dedicated brand surface (`/vendors/onboarding` or equivalent) tuned to them; the main homepage targets couples first.

**The split matters:** couples are shopping → emotional, exploratory, visual. Vendors are operating → practical, work-surface. The marketplace surface (this register) is for couples; the vendor dashboard is product register and lives under that.

## Product Purpose

Baazar.io is a marketplace where South Asian couples discover, compare, and book verified wedding vendors in Chicago. The platform handles inquiry → quote → 10% hold deposit → event-day delivery → release of funds, with cancellation policy and dispute coverage built in.

Success looks like: a couple lands on the homepage, recognizes "this is for me" within 5 seconds, can browse photographers or DJs by package + price + availability without typing a search, finds 2–3 vendors worth inquiring about in their first session, and trusts the platform enough to put down a deposit rather than DM a vendor on Instagram.

## Brand Personality

**Modern. Bold. With a cultural twist.**

Modern editorial commerce as the base — Ssense / MR PORTER / Aimé Leon Dore / Cult Gaia restraint, bold typography doing the heavy hierarchy work, beautiful photography (real weddings, real vendor work) as the visual content. Asymmetric grid, generous spacing, confident color commitment rather than safe pastels.

Then 2–3 cultural anchors layered in deliberately: a textile-derived palette move (saturated jewel tones drawn from real fabrics, not literal motifs pasted on as decoration), a typographic identity that pairs a confident display face with at least one nod to a regional script personality, and named-curation language that signals the platform was designed by people inside the culture, not adjacent to it.

Voice: matter-of-fact, lightly witty, not breathless. Treats wedding shopping as a real commercial activity rather than a fantasy. Says "$2,400 for 8 hours of coverage" before it says "create magical memories."

## Anti-references

**Explicit avoid:** SaaS-cream / Stripe-Vercel-Linear aesthetic. Cream-and-purple gradients, generic sans-serif everywhere, illustrated app icons, dashboard-y product chrome on the marketing surface. The current site is too close to this; the redesign must break decisively.

**Implicit avoids** (carried from the personality choice):

- **Pastel-bridal / Pinterest-soft.** Blush pinks, watercolor florals, script fonts, soft shadows. Reads small, amateur, and not for this user.
- **Heavy ornamental Indian.** Mandala backgrounds, gold-on-burgundy as the default, paisley wallpapers. Costume-y, ages fast, slips into kitsch.
- **Dark mode marketplace.** Wrong emotion for wedding shopping.
- **Default shadcn-everywhere look.** This is what the site looks like today; the redesign must produce something that nobody would mistake for an un-customized component library.

## Design Principles

1. **Bold, not loud.** Confident hierarchy + committed color, but a strict pruning of decorative elements. Every move on the page earns its weight. Maximum 2–3 distinctive design moves visible at once, not 8.
2. **Cultural anchors, not costume.** Layer cultural identity in via palette, typography, and curation language — not ornament. Two or three deliberate, repeating moves beat one piece of paisley wallpaper every time.
3. **Photography is the hero, chrome gets out of the way.** Vendor portfolios + real wedding moments carry the visual content. UI is the frame, not the picture. This means dark-ish typographic chrome and bright, saturated photography — not the other way around.
4. **Different from SaaS, different from bridal.** Both reflex aesthetics are explicit failures. If a visitor could mistake the homepage for either, we've missed.
5. **Brand modulates into product, doesn't dominate.** Marketing pages get the full personality. Dashboard + booking flows keep the type system + tokens but quiet the chrome — vendors should not feel like they're operating their business inside a fashion magazine.

## Accessibility & Inclusion

WCAG AA across all surfaces. Body text contrast ≥4.5:1, UI + large text ≥3:1. Keyboard navigation through all interactive elements with visible focus rings. `prefers-reduced-motion` respected on all decorative animations and parallax. No known specific user needs flagged for stricter targets yet — revisit when real-vendor or real-couple feedback surfaces an actual case.
