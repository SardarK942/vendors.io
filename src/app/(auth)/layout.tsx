/**
 * Auth route-group shell. The split-screen chrome (brand panel, wordmark, footer)
 * now lives in AuthSplitLayout, rendered per-page, so this is a passthrough.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
