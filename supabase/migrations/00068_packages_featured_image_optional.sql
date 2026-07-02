-- Make packages.featured_image_url optional.
--
-- Vendors are getting stalled on the "featured image required" gate during
-- package creation. Photo drives conversion once the package is live, but
-- forcing an image at creation time blocks vendors from validating the rest
-- of the flow (pricing, add-ons, notes) before they have final photos ready.
--
-- Render sites (PackageCard, PackageGrid, PackageDetailModal, BookingForm)
-- now fall back to a cream-toned tile with the package name centered when
-- the URL is null — matching the "custom request" tile treatment already
-- shipped in PackageGrid.

ALTER TABLE packages ALTER COLUMN featured_image_url DROP NOT NULL;
