// Fallback for the top slot of /dashboard. Never actually rendered because page.tsx
// always matches. Exists so Next's parallel-route resolver doesn't error when @panel
// is active but the top slot would otherwise be missing.
export default function DashboardDefault() {
  return null;
}
