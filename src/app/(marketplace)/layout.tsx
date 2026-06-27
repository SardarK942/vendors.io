import { BaazarChrome } from '@/components/ui/BaazarChrome';
import { Footer } from '@/components/layout/Footer';

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <BaazarChrome />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-20 sm:px-6 lg:px-8">{children}</main>
      <Footer />
    </div>
  );
}
