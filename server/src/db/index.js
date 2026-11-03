'use strict'
const { DatabaseSync } = require('node:sqlite')
const { readFileSync, mkdirSync } = require('node:fs')
const path = require('node:path')

function openDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true })
  const db = new DatabaseSync(filename)
  db.exec(readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'))
  db.prepare('INSERT OR IGNORE INTO schema_migrations VALUES (1, ?)').run(Date.now())
  const columns = db.prepare('PRAGMA table_info(ai_jobs)').all().map(c => c.name)
  transaction(db, () => {
    if (!columns.includes('provider_mode')) db.exec("ALTER TABLE ai_jobs ADD COLUMN provider_mode TEXT NOT NULL DEFAULT 'mock'")
    if (!columns.includes('provider_model')) db.exec("ALTER TABLE ai_jobs ADD COLUMN provider_model TEXT NOT NULL DEFAULT 'deterministic-fixtures-v1'")
    db.prepare('INSERT OR IGNORE INTO schema_migrations VALUES (2, ?)').run(Date.now())
  })
  db.prepare("INSERT OR IGNORE INTO users VALUES ('bot-yellow', '小黄', 'ai')").run()
  applyQualityMigration(db)
  return db
}
function applyQualityMigration(db) {
  transaction(db, () => {
    if (!db.prepare('SELECT version FROM schema_migrations WHERE version=3').get()) {
      // Reversible status change for known defective v1 mock outputs only.
      // Human comments, posts, observations and other AI outputs are retained.
      db.prepare(`UPDATE comments SET status='quality_withdrawn' WHERE author_type='ai' AND status='active'
        AND job_id IN (SELECT id FROM ai_jobs WHERE provider_mode='mock' AND provider_model='deterministic-fixtures-v1')
        AND (instr(content,'自然日记多了一格')>0 OR instr(content,'今天的观察日记又多了一行')>0)`).run()
      db.prepare('INSERT INTO schema_migrations VALUES (3, ?)').run(Date.now())
    }
  })
}
function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE')
  try { const result = fn(); db.exec('COMMIT'); return result }
  catch (error) { db.exec('ROLLBACK'); throw error }
}
module.exports = { openDatabase, transaction, applyQualityMigration }
