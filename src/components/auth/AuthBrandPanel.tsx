import Link from 'next/link';
import { AUTH_PANEL_CONTENT, type AuthPanelVariant } from './auth-panel-content';
import { AuthBrandIllustration } from './AuthBrandIllustration';

/**
 * Left brand panel of the auth split-screen. Cream→haldi→pink gradient (matching the
 * Figma signup frame), baazar. wordmark, a variant-aware heading + benefit chips, and —
 * on the signup variants only — the brand handshake illustration (it's the Figma
 * *signup* visual; login stays clean, wordmark + heading + chips over the gradient).
 * Hidden below lg (AuthSplitLayout shows a compact wordmark on mobile instead).
 */
export function AuthBrandPanel({ variant }: { variant: AuthPanelVariant }) {
  const { heading, subcopy, chips } = AUTH_PANEL_CONTENT[variant];
  const showIllustration = variant !== 'login';
  return (
    <aside className="relative hidden flex-col justify-between overflow-hidden bg-[linear-gradient(160deg,#fbf7ee_0%,#fff2d5_42%,#ffd9ec_78%,#ffc2e0_100%)] p-12 lg:flex">
      <Link href="/" className="relative z-10 inline-block">
        <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/60">
          MADE IN <span className="text-haldi">CHICAGO</span>
        </p>
        <span
          aria-label="Baazar"
          className="mt-1 block font-serif text-4xl font-extrabold lowercase leading-none tracking-[-0.025em] text-ink"
        >
          baazar
          <span aria-hidden className="text-hot-pink">
            .
          </span>
        </span>
      </Link>

      {showIllustration && (
        <div className="relative z-0 flex flex-1 items-center justify-center py-8">
          <AuthBrandIllustration className="w-full max-w-sm" />
        </div>
      )}

      <div className="relative z-10 max-w-md">
        <h2 className="m-0 font-serif text-3xl font-extrabold leading-[1.05] tracking-[-0.02em] text-ink">
          {heading}
        </h2>
        <p className="mt-3 text-base leading-[1.5] text-ink/70">{subcopy}</p>
        <ul className="mt-6 flex flex-col gap-2">
          {chips.map((c) => (
            <li key={c} className="flex items-center gap-2 text-sm font-medium text-ink">
              <svg
                aria-hidden
                viewBox="0 0 20 20"
                className="h-4 w-4 shrink-0 text-hot-pink"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 10.5l4 4 8-9" />
              </svg>
              {c}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
