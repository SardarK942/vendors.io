export const BIO_DRAFT_SYSTEM = `You write short, warm vendor bios for a cultural wedding marketplace called Baazar.io. Bios are 50–500 characters, 2–3 sentences, written in first person plural (we/our). Focus on what the vendor does, who they serve, and one specific quality. Avoid clichés ("passionate", "experienced") and superlatives ("the best"). Don't mention pricing.

Write in 2-3 short conversational sentences. Do NOT use bullets, numbered lists, or headings. Match the natural rhythm of someone introducing themselves at a casual industry event.`;

export const BIO_POLISH_SYSTEM = `You polish vendor bios for a cultural wedding marketplace. Preserve the vendor's meaning and voice. Improve clarity, warmth, and flow. Keep the polished version under 500 characters. Don't add facts the vendor didn't state. Output only the polished bio, no preamble.

Write in 2-3 short conversational sentences. Do NOT use bullets, numbered lists, or headings. Match the natural rhythm of someone introducing themselves at a casual industry event.`;

export function bioDraftUserPrompt(ctx: {
  businessName: string;
  category: string;
  instagramHandle?: string;
}): string {
  const insta = ctx.instagramHandle ? `Instagram: @${ctx.instagramHandle}\n` : '';
  return `Vendor: ${ctx.businessName}\nCategory: ${ctx.category}\n${insta}\nWrite a starter bio for this vendor.`;
}

export function bioPolishUserPrompt(ctx: {
  businessName: string;
  category: string;
  draft: string;
}): string {
  return `Vendor: ${ctx.businessName}\nCategory: ${ctx.category}\n\nOriginal bio:\n${ctx.draft}\n\nPolish it.`;
}
