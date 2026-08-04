-- supabase/migrations/00071_bookings_event_type_check_arab_additions.sql
-- Extend bookings_event_type_check to accept the three new Arab-culture event types
-- introduced in the custom-quote flow v2 (types/index.ts EVENT_TYPES).
-- Drop-and-recreate pattern; idempotent since DROP IF EXISTS handles reruns.

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_event_type_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_event_type_check CHECK (event_type IS NULL OR event_type IN ('engagement', 'roka', 'tilak', 'mehndi', 'sangeet', 'nikah', 'baraat', 'wedding', 'reception', 'walima', 'aqiqah', 'katb_el_kitab', 'laylat_al_henna', 'zaffa', 'multiple', 'birthday_party', 'anniversary', 'corporate_event', 'baby_shower', 'bridal_shower', 'graduation', 'quinceanera', 'sweet_16'));
