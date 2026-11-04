'use strict'
const { randomUUID } = require('node:crypto')
const { tags, sanitize, privateText, unsafeInput, normalText } = require('./safety')
const { relevantMemory } = require('./relevance')

const sourceQuery = `SELECT s.*, p.content AS post_content, p.status AS post_status, p.visibility,
 p.memory_allowed, c.content AS comment_content, c.status AS comment_status, c.author_type
 FROM memory_sources s JOIN posts p ON p.id=s.post_id LEFT JOIN comments c ON c.id=s.comment_id`
function validSource(row) {
  return row && row.post_status === 'active' && row.visibility === 'public' && row.memory_allowed === 1 &&
    (!row.comment_id || (row.comment_status === 'active' && row.author_type === 'human'))
}
function sourceValid(db, id, now = Date.now()) {
  return validSource(db.prepare(sourceQuery + " WHERE s.source_id=? AND EXISTS (SELECT 1 FROM community_memories m WHERE m.id=s.memory_id AND m.status='active' AND m.expires_at>?)").get(id, now))
}
function summarizeAnecdote(text) {
  const safe = sanitize(text)
  if ([...safe].length <= 120) return safe
  // Keep complete clauses; do not cut mid-word and present it as a quotation.
  const clauses = safe.match(/[^。！？!?；;\n，,]+[。！？!?；;\n，,]?/gu) || []
  let summary = ''
  for (const clause of clauses) {
    if ([...summary, ...clause].length > 120) break
    summary += clause
  }
  return summary.trim()
}
function refreshMemories(db, now) {
  // Recompute from live sources, never leave revoked prose in a retained summary.
  for (const memory of db.prepare('SELECT * FROM community_memories').all()) {
    const rows = db.prepare(sourceQuery + ' WHERE s.memory_id=?').all(memory.id)
    const valid = rows.filter(validSource)
    const invalid = rows.filter(row => !validSource(row))
    for (const source of invalid) {
      db.prepare("UPDATE comments SET status='source_revoked' WHERE id IN (SELECT comment_id FROM ai_comment_sources WHERE source_id=?)").run(source.source_id)
      db.prepare('DELETE FROM memory_sources WHERE memory_id=? AND source_id=?').run(memory.id, source.source_id)
    }
    const active = valid.length > 0 && memory.expires_at > now
    const summary = active ? summarizeAnecdote(valid[0].comment_id ? valid[0].comment_content : valid[0].post_content) : ''
    db.prepare('UPDATE community_memories SET summary=?,status=?,independent_authors=? WHERE id=?')
      .run(summary, active && summary ? 'active' : 'inactive', new Set(valid.map(row => row.author_id)).size, memory.id)
  }
}
function revokePostSources(db, postId) {
  db.prepare("UPDATE comments SET status='source_revoked' WHERE post_id=? AND author_type='ai'").run(postId)
  const rows = db.prepare('SELECT DISTINCT source_id FROM memory_sources WHERE post_id=?').all(postId)
  for (const { source_id } of rows) {
    db.prepare("UPDATE comments SET status='source_revoked' WHERE id IN (SELECT comment_id FROM ai_comment_sources WHERE source_id=?)").run(source_id)
  }
  db.prepare('DELETE FROM memory_sources WHERE post_id=?').run(postId)
}
function ingest(db, post, comment, now, config) {
  if (post.visibility !== 'public' || post.status !== 'active' || !post.memory_allowed) return
  if (comment && (comment.author_type !== 'human' || comment.status !== 'active')) return
  const text = comment ? comment.content : post.content
  if (privateText(text) || unsafeInput(text)) return
  const topicTags = tags(text)
  if (!topicTags.length) return
  const summary = summarizeAnecdote(text)
  if (!summary) return
  // Exact normalized anecdotes merge; different anecdotes keep their own provenance.
  const existing = db.prepare("SELECT * FROM community_memories WHERE status='active' AND expires_at>? ORDER BY created_at DESC").all(now)
    .find(m => normalText(m.summary) === normalText(summary))
  const id = existing ? existing.id : randomUUID()
  if (!existing) db.prepare('INSERT INTO community_memories (id,type,summary,species_tags,topic_tags,created_at,expires_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, 'topic', summary, JSON.stringify(post.species_name ? [post.species_name] : []), JSON.stringify(topicTags), now, now + config.memoryDays * 86400000)
  db.prepare('INSERT OR IGNORE INTO memory_sources (memory_id,source_id,post_id,comment_id,author_id) VALUES (?,?,?,?,?)')
    .run(id, comment ? `c:${comment.id}:v${post.version}` : `p:${post.id}:v${post.version}`, post.id, comment ? comment.id : null, comment ? comment.author_id : post.author_id)
  refreshMemories(db, now)
}
function retrieve(db, post, now) {
  refreshMemories(db, now)
  const wanted = new Set(tags(post.content + ' ' + post.species_name))
  if (!wanted.size) return []
  return db.prepare("SELECT * FROM community_memories WHERE status='active' AND expires_at>? ORDER BY created_at DESC LIMIT 500").all(now)
    .filter(m => relevantMemory(post.content, m.summary, post.species_name))
    .map(m => {
      const sources = db.prepare(sourceQuery + ' WHERE s.memory_id=? AND s.post_id<>? AND s.author_id<>?').all(m.id, post.id, post.author_id).filter(validSource)
      const related = JSON.parse(m.topic_tags).filter(tag => wanted.has(tag)).length
      // Only summaries supported by these particular allowed sources are exposed.
      return { id: m.id, summary: sources.length ? summarizeAnecdote(sources[0].comment_id ? sources[0].comment_content : sources[0].post_content) : '',
        sourceIds: sources.map(s => s.source_id), independentAuthors: new Set(sources.map(s => s.author_id)).size,
        confidenceLabel: 'public_anecdote', score: related > 0 ? related * 5 + Math.min(sources.length, 3) - (now - m.created_at) / 86400000 : -Infinity }
    }).filter(m => m.sourceIds.length && Number.isFinite(m.score))
    .sort((a, b) => b.score - a.score).slice(0, 4).map(({ score, ...m }) => m)
}
module.exports = { ingest, retrieve, sourceValid, refreshMemories, revokePostSources, summarizeAnecdote }
