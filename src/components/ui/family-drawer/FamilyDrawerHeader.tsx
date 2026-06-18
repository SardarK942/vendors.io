export function FamilyDrawerHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <header className="flex flex-col items-center text-center">
      <div className="mb-3">{icon}</div>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {description && <p className="mt-1 text-sm text-ink/70">{description}</p>}
    </header>
  );
}
