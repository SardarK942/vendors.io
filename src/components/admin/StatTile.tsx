import { Card, CardContent } from '@/components/ui/card';

/** A single headline number with a label — the admin dashboard's stat tile. */
export function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-3xl font-bold tabular-nums">{value}</div>
        <div className="mt-1 text-sm text-ink/60">{label}</div>
      </CardContent>
    </Card>
  );
}
