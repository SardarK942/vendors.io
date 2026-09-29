/**
 * Build-time feature flags (read from NEXT_PUBLIC_* env so client components can
 * use them). Set the env var to the string "true" to enable.
 *
 * SHOP_ENABLED gates the bridal/groom-wear Shop surface (buyer catalog, couple
 * measurement profiles, vendor product editor). The routes still exist by URL;
 * this only controls whether the nav entries are shown to users. Kept OFF in
 * production until the shop is user-ready (vendor onboarding + checkout).
 */
export const SHOP_ENABLED = process.env.NEXT_PUBLIC_SHOP_ENABLED === 'true';
