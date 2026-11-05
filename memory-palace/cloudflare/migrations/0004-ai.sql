-- UTC-day quotas and tenant-scoped AI state. Originals remain in cloud_jobs/captures.
ALTER TABLE cloud_jobs ADD COLUMN attempt_token TEXT;
ALTER TABLE cloud_jobs ADD COLUMN lease_expires_at INTEGER;
CREATE INDEX IF NOT EXISTS cloud_ai_running ON cloud_jobs(user_id,status,lease_expires_at);
CREATE TABLE IF NOT EXISTS cloud_ai_quota (
  scope TEXT NOT NULL,
  day TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope,day)
);
CREATE TABLE IF NOT EXISTS cloud_ai_sources (
  user_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  memory_id TEXT NOT NULL,
  PRIMARY KEY (user_id,fingerprint),
  FOREIGN KEY (user_id,memory_id) REFERENCES cloud_memories(user_id,id)
);
CREATE TABLE IF NOT EXISTS cloud_ai_pending (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  job_id TEXT NOT NULL,
  candidate TEXT NOT NULL CHECK (json_valid(candidate)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id,id),
  UNIQUE (user_id,fingerprint),
  FOREIGN KEY (user_id,job_id) REFERENCES cloud_jobs(user_id,id)
);
CREATE INDEX IF NOT EXISTS cloud_ai_pending_owner ON cloud_ai_pending(user_id,created_at);
