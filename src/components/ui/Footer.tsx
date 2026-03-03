import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t bg-muted/40">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div>
            <h3 className="text-sm font-semibold">Desi Wedding.io</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Chicago&apos;s marketplace for Desi wedding vendors. Discover, compare, and book with
              confidence.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold">For Couples</h3>
            <ul className="mt-2 space-y-1">
              <li>
                <Link href="/vendors" className="text-sm text-muted-foreground hover:text-primary">
                  Browse Vendors
                </Link>
              </li>
              <li>
                <Link href="/signup" className="text-sm text-muted-foreground hover:text-primary">
                  Create Account
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold">For Vendors</h3>
            <ul className="mt-2 space-y-1">
              <li>
                <Link href="/signup" className="text-sm text-muted-foreground hover:text-primary">
                  Claim Your Profile
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard"
                  className="text-sm text-muted-foreground hover:text-primary"
                >
                  Vendor Dashboard
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t pt-4 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Desi Wedding Marketplace. Chicago, IL.
        </div>
      </div>
    </footer>
  );
}
