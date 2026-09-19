/**
 * Per-vendor-type guidance for the couple-side custom / quote request "Tell us
 * what you're looking for" free-text box.
 *
 * A pure, side-effect-free lookup: given a vendor category it returns a friendly
 * textarea placeholder plus a short list of faint "You might mention:" bullets.
 * The bullets are guidance only — they are never inputs. Unknown categories (and
 * ones without a dedicated set, e.g. bridal_wear) fall back to a sensible generic
 * set so the box is always helpful.
 */

export interface RequestGuidance {
  /** Friendly placeholder shown inside the textarea. */
  placeholder: string;
  /** Faint "You might mention:" prompts rendered under the textarea. */
  bullets: string[];
}

const PLACEHOLDER = "Tell them what you're envisioning — the more detail, the better their quote.";

const GENERIC_BULLETS = ["What you're envisioning", 'Your budget', 'Any must-haves'];

const BULLETS_BY_CATEGORY: Record<string, string[]> = {
  photography: [
    'Coverage hours',
    'Must-have shots',
    'Cultural moments (baraat, joota chupai)',
    'Family photo list',
    'A style you love',
  ],
  videography: [
    'Highlight film vs full edit',
    'Key moments',
    'Cultural rituals',
    'Drone or live-stream',
    'Music vibe',
  ],
  content_creation: [
    'Platforms (Instagram/TikTok)',
    'The vibe you want',
    'Must-capture moments',
    'How fast you need them',
  ],
  dj: ['Genres & languages', 'Must-play songs', 'Do-not-play list', 'MC needs', 'Dhol'],
  photobooth: ['Hours needed', 'Backdrop theme', 'Props', 'Prints or digital'],
  live_music: ['Type (dhol / qawwali / band)', 'Songs you want', 'When during the event'],
  catering: ['Cuisine', 'Dietary needs (halal/veg/allergies)', 'Service style', 'Courses'],
  hair_makeup: ['Bridal or party', 'How many people', 'Number of looks', 'Trial', 'Any allergies'],
  carts: ['Type of treats', 'Flavors', 'Dietary needs', 'Roughly how many servings'],
  venue: ['Indoor or outdoor', 'Date flexibility', 'Catering rules', 'Parking'],
  decor: ['Color palette', 'Theme', 'Key areas (stage/mandap/entrance)', 'Florals'],
  invitations: ['Quantity', 'Style', 'Languages / scripts', 'Timeline', 'Print or digital'],
  gifts: ['Type', 'Quantity', 'Personalization', 'Budget per piece'],
  mehndi: [
    'Bridal or party',
    'Coverage / design',
    'Number of guests',
    'Number of artists',
    'Hours',
    'Style',
  ],
};

/**
 * Returns the placeholder + guidance bullets for a vendor category. Unknown
 * categories (and ones without a dedicated set) return the generic default.
 */
export function getRequestGuidance(category: string): RequestGuidance {
  return {
    placeholder: PLACEHOLDER,
    bullets: BULLETS_BY_CATEGORY[category] ?? GENERIC_BULLETS,
  };
}
