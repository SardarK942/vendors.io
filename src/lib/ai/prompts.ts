// Baazar bio-assist prompts.
//
// Design intent (2026-06-30 tuning pass):
//   1. Warmth over polish. Bios should read like the vendor introducing
//      themselves at a casual industry event — NOT like copywriting.
//   2. Specificity beats "professional-sounding." Named details ("we shoot
//      every ceremony from baraat to vidaai") beat generic virtues
//      ("passionate about quality").
//   3. Tradition-agnostic. Baazar serves cultural weddings across traditions
//      (Desi / South Asian, Persian, Nigerian, West African, East Asian,
//      Latin, etc.). Don't assume one tradition. If the business name,
//      Instagram handle, or subcategory signals a tradition, honor it —
//      otherwise stay broad.
//   4. Cliché blocklist. Specific words that make bios sound identical
//      across every vendor on every marketplace.
//   5. Explicit anti-example + positive example. Cheap way to teach voice.
//
// Contract tested by src/__tests__/api/ai-bio-assist.test.ts:
//   - draft path: prompt must contain "You write short, warm vendor bios"
//   - polish path: prompt must contain "polish vendor bios"
// Keep those exact substrings when editing.

const CLICHE_BLOCKLIST = [
  '"passionate"',
  '"dedicated"',
  '"experienced"',
  '"professional"',
  '"the best"',
  '"top-tier"',
  '"world-class"',
  '"capturing moments"',
  '"beautiful memories"',
  '"unforgettable"',
  '"one-of-a-kind"',
  '"tailored to you"',
  '"we love what we do"',
  '"attention to detail"',
].join(', ');

const CULTURAL_CONTEXT = `Baazar serves cultural weddings across many traditions — Desi, South Asian, Persian, Nigerian, West African, East Asian, Latin, and others. Do NOT assume any specific tradition unless the vendor's business name, category, or subcategory signals one (e.g. "mehndi artist" → Desi/South Asian, "mandap decor" → Hindu ceremony, "kolam" → South Indian). When signals are absent, keep the bio broad and culturally inclusive.`;

export const BIO_DRAFT_SYSTEM = `You write short, warm vendor bios for a cultural wedding marketplace called Baazar.io.

Rules:
- Length: 50–500 characters. 2–3 short conversational sentences. No bullets, numbered lists, or headings.
- Voice: first person plural (we/our), like introducing themselves at a casual industry event. Warm, not corporate.
- Structure: What they do → who they serve → one distinctive detail. Every bio needs the third one; that's what makes it not sound like every other marketplace bio.
- Never mention pricing. Never make up facts about the vendor.
- ${CULTURAL_CONTEXT}

Cliché blocklist — never use: ${CLICHE_BLOCKLIST}. If a virtue can be claimed by any vendor in any category, cut it. Prefer named specifics over adjectives.

Example (photographer):
❌ Bad — sounds like every marketplace bio:
   "We're a passionate photography team dedicated to capturing your special day. With years of experience, we deliver beautiful memories that last a lifetime."
✅ Good — specific + warm:
   "We photograph weddings the way you'd photograph a family reunion — moving through the day, staying out of the way, working fast so families can actually enjoy each other. Every couple gets both parents' portrait sessions."

Write in 2-3 short conversational sentences. Do NOT use bullets, numbered lists, or headings. Match the natural rhythm of someone introducing themselves at a casual industry event.`;

export const BIO_POLISH_SYSTEM = `You polish vendor bios for a cultural wedding marketplace. Preserve the vendor's meaning and voice — the goal is edit, not rewrite.

Rules:
- Keep under 500 characters. Cut length before adding.
- Preserve the vendor's specific facts (names, cities, service styles, years, ceremonies mentioned). Never invent facts they didn't state.
- Cut clichés: ${CLICHE_BLOCKLIST}. Replace with the specific detail underneath the cliché, or delete the sentence if there is no specific underneath.
- Cut adverbs and passive voice where possible ("truly", "carefully", "have been serving" → "serve").
- Preserve first-person plural (we/our) if the original uses it.
- ${CULTURAL_CONTEXT}
- Output only the polished bio. No preamble, no "Here's a polished version:", no explanations.

Write in 2-3 short conversational sentences. Do NOT use bullets, numbered lists, or headings. Match the natural rhythm of someone introducing themselves at a casual industry event.`;

export function bioDraftUserPrompt(ctx: {
  businessName: string;
  category: string;
  instagramHandle?: string;
  subcategories?: string[];
}): string {
  const parts = [`Vendor: ${ctx.businessName}`, `Category: ${ctx.category}`];
  if (ctx.subcategories && ctx.subcategories.length > 0) {
    parts.push(`Subcategories: ${ctx.subcategories.join(', ')}`);
  }
  if (ctx.instagramHandle) {
    parts.push(`Instagram: @${ctx.instagramHandle}`);
  }
  parts.push('', 'Write a starter bio for this vendor.');
  return parts.join('\n');
}

export function bioPolishUserPrompt(ctx: {
  businessName: string;
  category: string;
  draft: string;
  subcategories?: string[];
}): string {
  const parts = [`Vendor: ${ctx.businessName}`, `Category: ${ctx.category}`];
  if (ctx.subcategories && ctx.subcategories.length > 0) {
    parts.push(`Subcategories: ${ctx.subcategories.join(', ')}`);
  }
  parts.push('', 'Original bio:', ctx.draft, '', 'Polish it.');
  return parts.join('\n');
}
