// Minimal route group for full-screen flows that must escape the
// dashboard chrome. `src/app/dashboard/layout.tsx` unconditionally wraps
// its children in SidebarProvider/SidebarInset (see Task 9 route decision
// in .superpowers/sdd/task-9-report.md) — there's no per-route escape hatch
// there, so the event-creation wizard lives here instead. Each page in this
// group renders its own top bar; this layout only sets the canvas.
export default function WizardLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-cream">{children}</div>;
}
