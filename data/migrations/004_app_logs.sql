CREATE TABLE IF NOT EXISTS app_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  logged_at timestamptz NOT NULL DEFAULT now(),
  level text NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  source text NOT NULL,
  event text NOT NULL,
  message text NOT NULL,
  url text,
  duration_ms integer,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS app_logs_logged_at_idx ON app_logs (logged_at DESC);
CREATE INDEX IF NOT EXISTS app_logs_level_idx ON app_logs (level);
