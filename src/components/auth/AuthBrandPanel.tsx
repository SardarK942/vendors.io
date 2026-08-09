import Link from 'next/link';
import { AUTH_PANEL_CONTENT, type AuthPanelVariant } from './auth-panel-content';
import { AuthBrandIllustration } from './AuthBrandIllustration';

/**
 * Left brand panel of the auth split-screen, matching the Figma signup frame:
 * a cream→pink gradient over a faint venue texture, with the `baazar.` wordmark +
 * heading + subcopy at the top, the full-bleed handshake in the middle (signup
 * variants only), and a "Get Started with Us" label above three numbered glass
 * benefit cards at the bottom. Hidden below lg (AuthSplitLayout shows a compact
 * wordmark on mobile instead).
 */
export function AuthBrandPanel({ variant }: { variant: AuthPanelVariant }) {
  const { heading, subcopy, cardsLabel, cards } = AUTH_PANEL_CONTENT[variant];
  const showIllustration = variant !== 'login';

  const headingBlock = (
    <>
      <h2 className="max-w-[16ch] font-serif text-4xl font-extrabold leading-[1.03] tracking-[-0.02em] text-ink xl:text-5xl">
        {heading}
      </h2>
      <p className="mt-4 max-w-md text-base leading-[1.55] text-ink/70">{subcopy}</p>
    </>
  );

  return (
    <aside className="relative hidden flex-col overflow-hidden bg-[linear-gradient(160deg,#fbf7ee_0%,#fff2d5_42%,#ffd9ec_78%,#ffc2e0_100%)] p-10 lg:flex xl:p-12">
      {/* Faint wedding-venue texture behind everything (matches the Figma). */}
      {/* eslint-disable-next-line @next/next/no-img-element -- static decorative bg */}
      <img
        src="/auth/panel-texture.jpg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.06] mix-blend-luminosity"
      />

      {/* Wordmark — always at the top */}
      <Link href="/" className="relative z-10 inline-block self-start">
        <span
          aria-label="Baazar"
          className="block font-serif text-5xl font-extrabold lowercase leading-none tracking-[-0.03em] text-ink"
        >
          baazar
          <span aria-hidden className="text-hot-pink">
            .
          </span>
        </span>
      </Link>

      {showIllustration ? (
        <>
          {/* signup: heading under the wordmark, full-bleed handshake fills the middle */}
          <div className="relative z-10 mt-9">{headingBlock}</div>
          <div className="relative z-0 -mx-10 flex flex-1 items-center justify-center overflow-hidden xl:-mx-12">
            {/* Scale the handshake up (transform, so flex-shrink can't undo it)
                so the arms run off both edges and the flat sleeve cut-offs are
                clipped by the container's overflow-hidden. */}
            <AuthBrandIllustration className="w-full max-w-none origin-center scale-[1.4]" />
          </div>
        </>
      ) : (
        // login: heading + subcopy vertically centered in the middle (no illustration)
        <div className="relative z-10 flex flex-1 flex-col justify-center">{headingBlock}</div>
      )}

      {/* Bottom — section label + numbered glass benefit cards */}
      <div className="relative z-10">
        <h3 className="font-serif text-3xl font-bold tracking-[-0.01em] text-ink">{cardsLabel}</h3>
        <div className="mt-5 flex gap-2.5">
          {cards.map((card, i) => (
            <div
              key={card}
              className="group flex flex-1 flex-col gap-5 rounded-2xl border border-white/20 bg-cream/55 p-5 backdrop-blur-md transition-[transform,background-color,box-shadow] duration-200 ease-out hover:-translate-y-1 hover:bg-cream/75 hover:shadow-[0_14px_30px_rgba(26,26,26,0.12)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <span className="flex size-6 items-center justify-center rounded-full bg-ink text-xs font-medium text-white transition-colors duration-200 group-hover:bg-hot-pink">
                {i + 1}
              </span>
              <p className="text-sm font-semibold leading-snug text-ink">{card}</p>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
