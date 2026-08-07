/**
 * Brand illustration for the auth split-screen brand panel — the Baazar handshake,
 * exported from the Figma signup frame and committed to the repo at
 * `public/auth/handshake.svg` (self-contained vector; no dependency on the expiring
 * Figma asset URL). Decorative — the panel's `baazar.` wordmark carries the brand
 * name, so the image is aria-hidden.
 */
export function AuthBrandIllustration({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static decorative vector, no next/image needed
    <img src="/auth/handshake.svg" alt="" aria-hidden="true" className={className} />
  );
}
