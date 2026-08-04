import Link from 'next/link';
import { AuthBrandPanel } from './AuthBrandPanel';
import type { AuthPanelVariant } from './auth-panel-content';

/**
 * Two-column auth shell: left AuthBrandPanel (lg+), right form column. Stacks to a
 * single column under lg with a compact wordmark header above the form. Shared by
 * both /login and /signup so auth reads as one unified surface.
 */
export function AuthSplitLayout({
  variant,
  children,
}: {
  variant: AuthPanelVariant;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
      <AuthBrandPanel variant={variant} />

      <main className="flex flex-col bg-white">
        {/* Mobile-only compact wordmark (brand panel is hidden < lg) */}
        <div className="px-4 pt-10 text-center lg:hidden">
          <Link href="/" className="inline-block">
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
        </div>

        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-md">{children}</div>
        </div>

        <footer className="px-4 pb-8 text-center text-xs text-ink/50">
          <Link href="/terms" className="hover-pink-text">
            Terms
          </Link>
          <span className="mx-2">·</span>
          <Link href="/privacy" className="hover-pink-text">
            Privacy
          </Link>
          <span className="mx-2">·</span>
          <Link href="/" className="hover-pink-text">
            Back to baazar.io
          </Link>
        </footer>
      </main>
    </div>
  );
}
