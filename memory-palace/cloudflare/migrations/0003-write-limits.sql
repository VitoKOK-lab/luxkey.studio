CREATE TABLE IF NOT EXISTS cloud_write_limits (
  user_id TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cloud_write_limits_expiry ON cloud_write_limits(window_start);
