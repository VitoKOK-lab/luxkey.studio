-- Empty cloud vaults only. Never import the private local SQLite vault.
CREATE TABLE IF NOT EXISTS cloud_memories (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  content TEXT NOT NULL CHECK (json_valid(content)),
  room_id TEXT NOT NULL,
  locus_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
  next_review TEXT NOT NULL,
  created_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS cloud_active_locus
  ON cloud_memories(user_id, room_id, locus_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS cloud_memory_review ON cloud_memories(user_id, status, next_review);
CREATE TABLE IF NOT EXISTS cloud_revisions (
  revision_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  memory_id TEXT NOT NULL,
  action TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  snapshot TEXT NOT NULL CHECK (json_valid(snapshot)),
  FOREIGN KEY (user_id, memory_id) REFERENCES cloud_memories(user_id, id)
);
CREATE INDEX IF NOT EXISTS cloud_revision_owner ON cloud_revisions(user_id, revision_id);
CREATE TABLE IF NOT EXISTS cloud_settings (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL CHECK (json_valid(value)),
  PRIMARY KEY (user_id, key)
);
CREATE TABLE IF NOT EXISTS cloud_jobs (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  input TEXT NOT NULL CHECK (json_valid(input)),
  status TEXT NOT NULL DEFAULT 'awaiting_api',
  result TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, id),
  UNIQUE (user_id, request_id)
);
CREATE INDEX IF NOT EXISTS cloud_conversation ON cloud_jobs(user_id, conversation_id, sequence);
-- Chunk large data URLs to remain below D1's per-row/string size limit.
CREATE TABLE IF NOT EXISTS cloud_captures (
  user_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  chunk INTEGER NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY (user_id, job_id, chunk),
  FOREIGN KEY (user_id, job_id) REFERENCES cloud_jobs(user_id, id)
);
