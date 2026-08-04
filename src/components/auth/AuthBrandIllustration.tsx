/**
 * Inline brand illustration for the auth split-screen brand panel — a stylized
 * celebration arch (mandap) with confetti in the locked palette. Committed inline
 * so it never depends on the (expiring) Figma asset export. Decorative only.
 */
export function AuthBrandIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 320"
      className={className}
      role="img"
      aria-label="Baazar celebration illustration"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* soft ground */}
      <ellipse cx="200" cy="290" rx="150" ry="18" fill="#1a1a1a" opacity="0.06" />
      {/* arch */}
      <path
        d="M96 288 V150 a104 104 0 0 1 208 0 V288"
        fill="none"
        stroke="#1a1a1a"
        strokeWidth="10"
        strokeLinecap="round"
      />
      {/* arch inner fill */}
      <path d="M112 288 V150 a88 88 0 0 1 176 0 V288 Z" fill="#d1006c" opacity="0.08" />
      {/* haldi crown */}
      <path
        d="M150 96 a50 50 0 0 1 100 0"
        fill="none"
        stroke="#f2b92e"
        strokeWidth="8"
        strokeLinecap="round"
      />
      {/* pillars base flourish */}
      <circle cx="96" cy="288" r="12" fill="#1a1a1a" />
      <circle cx="304" cy="288" r="12" fill="#1a1a1a" />
      {/* hanging bells / diyas */}
      <circle cx="200" cy="150" r="14" fill="#d1006c" />
      <circle cx="200" cy="150" r="6" fill="#ffec1f" />
      {/* confetti */}
      <rect
        x="60"
        y="60"
        width="10"
        height="10"
        rx="2"
        fill="#f2b92e"
        transform="rotate(20 65 65)"
      />
      <rect
        x="330"
        y="80"
        width="10"
        height="10"
        rx="2"
        fill="#d1006c"
        transform="rotate(-15 335 85)"
      />
      <circle cx="70" cy="150" r="5" fill="#d1006c" />
      <circle cx="335" cy="160" r="5" fill="#f2b92e" />
      <rect
        x="140"
        y="40"
        width="8"
        height="8"
        rx="2"
        fill="#ffec1f"
        transform="rotate(30 144 44)"
      />
      <rect
        x="250"
        y="44"
        width="8"
        height="8"
        rx="2"
        fill="#f2b92e"
        transform="rotate(-25 254 48)"
      />
    </svg>
  );
}
