import Link from 'next/link';

/**
 * Auth shell — cream bg with a Baazar wordmark header and a culturally-focused
 * tagline. The wordmark mirrors the homepage hero typography (Devanagari main
 * mark with a hot-pink period) so the brand carries across.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col bg-cream">
      {/* Top header — Baazar wordmark + Made in Chicago kicker */}
      <header className="mx-auto w-full max-w-md px-4 pt-10">
        <Link href="/" className="block text-center">
          <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/60">
            MADE IN <span className="text-haldi">CHICAGO</span>
          </p>
          <h1
            aria-label="Baazar"
            className="m-0 mt-1 font-serif font-extrabold lowercase leading-none tracking-[-0.025em] text-ink"
            style={{ fontSize: 'clamp(40px, 6vw, 56px)' }}
          >
            <span>baazar</span>
            <span aria-hidden="true" className="text-hot-pink">
              .
            </span>
          </h1>
          <p className="mt-2 text-xs text-ink/70">
            The marketplace for culturally-focused vendors.
          </p>
        </Link>
      </header>

      {/* Form area — vertically centered between header and footer */}
      <div className="flex flex-1 items-start justify-center px-4 py-10">
        <div className="w-full max-w-md">{children}</div>
      </div>

      {/* Footer — small set of legal links */}
      <footer className="mx-auto w-full max-w-md px-4 pb-8 text-center text-xs text-ink/50">
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
    </div>
  );
}
