# Measurement Profiles — reusable per-buyer body measurements (WS-1)

**Date:** 2026-09-27
**Status:** Backend + pure libs implemented (WS-1). UI (modal/pages) is WS-2, not built here.
**Branch:** `feat/shop-prototype`

## Scope

A buyer (couple) takes their body measurements **once** and saves them as a
reusable profile ("Bride", "Groom"), then reuses that profile across
made-to-measure orders instead of re-entering numbers each time.

This slice ships the reusable-profile foundation only:

- Migration `00083_user_measurement_profiles.sql`
- Types (`MeasurementGarment`, `MeasurementUnit`, table Row/Insert/Update)
- Pure field taxonomy lib (`src/lib/products/measurement-schemas.ts`)
- Pure validation lib (`src/lib/products/measurement-validation.ts`)
- Zod schemas (`measurementProfileSchema`, `updateMeasurementProfileSchema`)
- Service (`src/services/measurements.service.ts`) + REST API
  (`/api/measurement-profiles`, `/api/measurement-profiles/[id]`)
- Unit tests for the validation lib

**Explicitly deferred to later slices:** the measurement modal / any React UI,
the made-to-measure PURCHASE wiring (a `customization_type` on a product/order
that pulls a saved profile), and any post-delivery `alteration_claim` flow.

## Data model (`user_measurement_profiles`)

| column         | type        | notes                                                   |
| -------------- | ----------- | ------------------------------------------------------- |
| `id`           | uuid PK     | `gen_random_uuid()`                                     |
| `user_id`      | uuid FK     | → `users(id)` ON DELETE CASCADE                         |
| `label`        | text        | e.g. "Bride", "Groom"                                   |
| `garment`      | text CHECK  | `'lehenga' \| 'sherwani'` (extensible later)            |
| `measurements` | jsonb       | machine-key → value, **inches**, default `{}`           |
| `unit`         | text CHECK  | `'in' \| 'cm'`, display preference only, default `'in'` |
| `created_at`   | timestamptz | `now()`                                                 |
| `updated_at`   | timestamptz | `now()`, app-maintained (no trigger)                    |

Indexed on `user_id`. RLS: owner-only (`user_id = auth.uid()`, FOR ALL) + an
admin FOR ALL policy. **No public SELECT** — body measurements are private to
the buyer (and admins).

## The body-vs-garment rule (important)

`measurements` stores **BODY measurements only** — the numbers a buyer takes off
their own body (around bust, chest, height, …), keyed by machine key, values
**always in inches**. It is NOT the finished-garment spec; the tailor derives
finished dimensions (ease, style allowances) from the body numbers. `unit` is a
display preference only; nothing stored is ever centimetres.

## Field taxonomy + validation

Ported verbatim from the vetted prototype (`measure-modal.html`):

- `LEHENGA_FIELDS` (13), `SHERWANI_FIELDS` (14), `MEASUREMENT_SCHEMAS`,
  `getMeasurementSchema`, `GARMENT_META` — labels, machine keys, groups, how-to
  copy, typical inch ranges, `back`/`tricky` flags, sleeve presets, and SVG
  highlight geometry (`band` / `line` / `point`).
- Validation (`IN2CM = 2.54`, `toInches`, `toDisplay`, `round2`, `fieldState`,
  `crossFieldWarnings`, `missingCount`) — `fieldState` flags out-of-range;
  `crossFieldWarnings` reproduces both garments' cross-field sanity checks with
  messages identical to the prototype.

## API

- `GET  /api/measurement-profiles` — current buyer's profiles
- `POST /api/measurement-profiles` — create (Zod `measurementProfileSchema`)
- `PATCH  /api/measurement-profiles/[id]` — update (partial)
- `DELETE /api/measurement-profiles/[id]` — delete

All require an authenticated user; ownership is enforced by RLS plus explicit
`user_id` checks in the service.
