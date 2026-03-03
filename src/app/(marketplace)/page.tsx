import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { SearchBar } from '@/components/marketplace/SearchBar';
import { CategoryGrid } from '@/components/marketplace/CategoryGrid';
import { CheckCircle, Shield, Clock } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="space-y-16 py-8">
      {/* Hero Section */}
      <section className="space-y-6 pt-8 text-center md:pt-16">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          Find Your Perfect
          <br />
          <span className="text-primary/80">Desi Wedding</span> Vendors
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Chicago&apos;s marketplace for South Asian wedding vendors. Discover, compare, and book
          verified vendors with transparent pricing and secure hold deposits.
        </p>

        {/* Search Bar */}
        <div className="mx-auto max-w-xl">
          <SearchBar />
        </div>

        <div className="flex justify-center gap-4">
          <Button size="lg" asChild>
            <Link href="/vendors">Browse All Vendors</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/signup">List Your Business</Link>
          </Button>
        </div>
      </section>

      {/* Categories */}
      <section className="space-y-6">
        <h2 className="text-center text-2xl font-bold">Browse by Category</h2>
        <CategoryGrid />
      </section>

      {/* Trust Signals */}
      <section className="rounded-xl bg-muted/50 px-6 py-12">
        <h2 className="mb-8 text-center text-2xl font-bold">Why Couples Trust Us</h2>
        <div className="grid gap-8 sm:grid-cols-3">
          <div className="text-center">
            <CheckCircle className="mx-auto h-10 w-10 text-primary" />
            <h3 className="mt-3 font-semibold">Verified Vendors</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Every vendor is verified. Real businesses, real portfolios, real pricing.
            </p>
          </div>
          <div className="text-center">
            <Shield className="mx-auto h-10 w-10 text-primary" />
            <h3 className="mt-3 font-semibold">Secure Deposits</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Small hold deposits powered by Stripe. Full refund if vendor doesn&apos;t confirm.
            </p>
          </div>
          <div className="text-center">
            <Clock className="mx-auto h-10 w-10 text-primary" />
            <h3 className="mt-3 font-semibold">Fast Response</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Vendors must respond within 72 hours. No more waiting weeks for quotes.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
