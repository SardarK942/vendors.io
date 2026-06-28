import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">404</p>
      <h1 className="mt-2 text-pretty text-3xl font-bold">Page not found</h1>
      <p className="mt-2 text-pretty text-muted-foreground">
        The page you’re looking for doesn’t exist or has been moved.
      </p>
      <Button asChild className="mt-6">
        <Link href="/">Go Home</Link>
      </Button>
    </div>
  );
}
