CREATE TABLE ai_bio_assist_calls (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  calls_in_window integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_bio_assist_calls ENABLE ROW LEVEL SECURITY;
-- No policies: service-role-only access from the API endpoint.
