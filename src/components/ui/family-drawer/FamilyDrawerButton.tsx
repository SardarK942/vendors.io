export function FamilyDrawerButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg border border-ink/15 bg-cream px-4 py-3 text-left text-sm font-medium text-ink hover:bg-ink/5"
    >
      {children}
    </button>
  );
}
