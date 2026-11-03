PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, author_type TEXT NOT NULL CHECK(author_type IN ('human','ai')));
CREATE TABLE IF NOT EXISTS dev_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS user_preferences (user_id TEXT PRIMARY KEY REFERENCES users(id), enabled INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS posts (
 id TEXT PRIMARY KEY, author_id TEXT NOT NULL REFERENCES users(id), content TEXT NOT NULL,
 species_name TEXT NOT NULL DEFAULT '', observation_id TEXT, visibility TEXT NOT NULL DEFAULT 'public',
 memory_allowed INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'active', version INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, request_key TEXT NOT NULL,
 test_namespace TEXT, UNIQUE(author_id, request_key)
);
CREATE TABLE IF NOT EXISTS comments (
 id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id), author_id TEXT NOT NULL REFERENCES users(id),
 author_type TEXT NOT NULL CHECK(author_type IN ('human','ai')), content TEXT NOT NULL,
 created_at INTEGER NOT NULL, reply_to_comment_id TEXT REFERENCES comments(id), status TEXT NOT NULL DEFAULT 'active',
 request_key TEXT NOT NULL, job_id TEXT UNIQUE, UNIQUE(post_id, author_id, request_key)
);
CREATE TABLE IF NOT EXISTS reactions (
 post_id TEXT NOT NULL REFERENCES posts(id), user_id TEXT NOT NULL REFERENCES users(id),
 type TEXT NOT NULL CHECK(type IN ('like','seen')), PRIMARY KEY(post_id, user_id, type)
);
CREATE TABLE IF NOT EXISTS ai_jobs (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL UNIQUE, post_id TEXT NOT NULL REFERENCES posts(id),
 source_comment_id TEXT REFERENCES comments(id), target_user_id TEXT NOT NULL REFERENCES users(id),
 kind TEXT NOT NULL, decision TEXT NOT NULL, reason_code TEXT NOT NULL,
 probability REAL NOT NULL, random_value REAL, due_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
 status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, lease_until INTEGER, lease_token TEXT,
 config_version TEXT NOT NULL, post_version INTEGER NOT NULL, force_test INTEGER NOT NULL DEFAULT 0,
 memory_ids TEXT NOT NULL DEFAULT '[]', source_ids TEXT NOT NULL DEFAULT '[]',
 latency_ms INTEGER, usage_json TEXT, error_category TEXT, prompt_version TEXT NOT NULL DEFAULT 'personality-3',
 provider_mode TEXT NOT NULL DEFAULT 'mock', provider_model TEXT NOT NULL DEFAULT 'functional-fixtures-v2',
 UNIQUE(post_id,kind)
);
CREATE INDEX IF NOT EXISTS jobs_due ON ai_jobs(status, due_at);
CREATE TABLE IF NOT EXISTS provider_calls (id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES ai_jobs(id), created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS community_memories (
 id TEXT PRIMARY KEY, type TEXT NOT NULL, summary TEXT NOT NULL, species_tags TEXT NOT NULL,
 topic_tags TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 visibility TEXT NOT NULL DEFAULT 'public', status TEXT NOT NULL DEFAULT 'active',
 confidence_label TEXT NOT NULL DEFAULT 'public_anecdote', independent_authors INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS memory_sources (
 memory_id TEXT NOT NULL REFERENCES community_memories(id), source_id TEXT NOT NULL,
 post_id TEXT NOT NULL REFERENCES posts(id), comment_id TEXT REFERENCES comments(id), author_id TEXT NOT NULL REFERENCES users(id),
 PRIMARY KEY(memory_id,source_id)
);
CREATE TABLE IF NOT EXISTS ai_comment_sources (
 comment_id TEXT NOT NULL REFERENCES comments(id), source_id TEXT NOT NULL, PRIMARY KEY(comment_id,source_id)
);
CREATE TABLE IF NOT EXISTS comment_hidden (comment_id TEXT NOT NULL REFERENCES comments(id), user_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(comment_id,user_id));
CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, comment_id TEXT NOT NULL REFERENCES comments(id), user_id TEXT NOT NULL REFERENCES users(id), reason TEXT NOT NULL, created_at INTEGER NOT NULL);
