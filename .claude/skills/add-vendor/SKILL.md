---
name: add-vendor
description: "Use when the user wants to hand-curate a vendor — they paste a business name, Google Maps URL/short-link, Instagram handle, or Instagram URL and want it added to the public scraped_vendors listing. Pulls business details + photos from Google Maps Places, infers a category, shows a preview, asks for confirmation, then inserts a row with source='hand_curated'. Use anytime the user says: add vendor, add this vendor, hand-curate, curate, add to listings, drop them in, put them on the site."
user-invocable: true
argument-hint: '<business name | Google Maps URL | IG handle | IG URL> [category]'
allowed-tools:
  - Bash(npm run curate:lookup *)
  - Bash(npm run curate:insert *)
  - Bash(cat /tmp/add-vendor-preview.json)
  - Read
  - Edit
---

# Add a hand-curated vendor

Pulls Google Maps Place data for an identifier, builds a preview, confirms with the user, then inserts into `scraped_vendors` with `source='hand_curated'`. The new row appears immediately on `/vendors` (public RPC filters out `disputed_at` and respects `claimed_at`, neither of which is set on a fresh hand-curated row).

## Categories

The 14 valid `vendor_profiles_category_check` values. Must match exactly:

`photography`, `videography`, `mehndi`, `hair_makeup`, `dj`, `photobooth`, `catering`, `venue`, `decor`, `invitations`, `bridal_wear`, `live_music`, `carts`, `content_creation`

## Procedure

1. **Parse the user's input** into a single identifier string. Accepted forms:
   - Business name: `Chicago Paan Cart`
   - Google Maps long URL: `https://www.google.com/maps/place/...`
   - Google Maps short URL: `https://maps.app.goo.gl/...`
   - Instagram URL: `https://www.instagram.com/paanistan/`
   - Instagram handle: `@paanistan` or `paanistan`
   - If the user passes a category alongside, hold it for step 4.

2. **Run lookup** — exactly one shell call:

   ```
   npm run curate:lookup -- "<identifier>"
   ```

   The script writes `/tmp/add-vendor-preview.json` and prints a short summary. If it exits with code 2 (`no Google Maps match`), tell the user the name didn't resolve and ask for a Google Maps URL or a more specific name. Do not retry with a guessed alternative.

3. **Present the preview** to the user in a compact format. Show: `business_name`, inferred `category`, `city, state`, `phone`, `website`, `instagram`, `photos` count, and the `google_url`. Call out anything missing (e.g. no phone, no IG, photos=0). If `category` is `null`, ask the user which category to use — they must pick one from the list above.

   **Quality flag**: if the user's input was an IG handle (`@foo` or `instagram.com/foo`) but the resolved `business_name` doesn't share a recognizable token with the handle (e.g. user said `@chicagokulficart`, lookup returned `Chicago Artists Coalition`), flag it loudly — `Google Maps text-search on bare IG handles is unreliable; this may be the wrong vendor.` Ask the user to either supply the actual business name or paste the Google Maps URL.

4. **Wait for confirmation**. Do not insert until the user explicitly approves (`yes`, `looks good`, `insert`, `go`, etc.). If they want changes to a field other than category, edit `/tmp/add-vendor-preview.json` directly with the `Edit` tool, then re-show the preview before inserting. Do not invent edits.

5. **Insert** — exactly one shell call:

   ```
   npm run curate:insert -- --category=<chosen_category>
   ```

   (The script defaults to `/tmp/add-vendor-preview.json` when no path is given.) On success it prints the inserted `id`, `slug`, and `/vendors/<slug>` link. Surface that link to the user.

6. **Duplicate guard**: if the script exits with code 3 (`duplicate: a scraped_vendors row already exists for @handle`), do not retry. Tell the user the IG handle is already in the table and link them to the existing row's slug (look it up via `gh` or psql if needed). They can ask to soft-undelete or update separately.

## What this skill does NOT do

- Does not re-host Google Maps photo URLs to UploadThing (storage is exhausted — there's a parked decision on that). Photos go in with `maps.googleapis.com` URLs; a later rehost run will migrate them once storage is sorted.
- Does not call the Instagram scraper. Even when the user passes an IG handle, the lookup still goes through Google Maps Text Search using the handle as the query — fast and zero Apify cost. If a vendor genuinely has no Google Maps presence, this skill won't find them; add them via a different path.
- Does not bulk-import. One vendor per invocation. For batches, ask the user whether they want a CSV importer scaffolded — that's a separate task.
- Does not touch `vendor_profiles`. Hand-curated rows live in `scraped_vendors` and become claimable via the existing K-2 "I own this business" flow.

## When to push back

- User asks for a category not in the list above → list the 14, ask them to pick.
- Multiple vendors pasted at once → do them one at a time, in order, confirming each.
- User asks for an IG handle that returns a Prague restaurant (or any non-Chicago result) → flag the city in the preview and ask whether to proceed or skip; do not silently insert out-of-area vendors.
