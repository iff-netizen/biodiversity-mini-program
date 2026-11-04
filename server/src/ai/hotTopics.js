'use strict'
const { tags, privateText, unsafeInput, normalText } = require('./safety')
function hotTopics(db, now) {
  const rows = db.prepare(`SELECT p.id,p.author_id,p.content,p.created_at FROM posts p JOIN users u ON u.id=p.author_id
    WHERE p.status='active' AND p.visibility='public' AND p.memory_allowed=1 AND u.author_type='human' AND p.created_at>=?
    UNION ALL SELECT c.id,c.author_id,c.content,c.created_at FROM comments c JOIN posts p ON p.id=c.post_id
    WHERE c.status='active' AND c.author_type='human' AND p.status='active' AND p.visibility='public' AND p.memory_allowed=1 AND c.created_at>=?`)
    .all(now - 7 * 86400000, now - 7 * 86400000)
  const topics = new Map(), duplicates = new Set()
  for (const row of rows) {
    if (privateText(row.content) || unsafeInput(row.content)) continue
    const key = row.author_id + ':' + normalText(row.content)
    if (duplicates.has(key)) continue
    duplicates.add(key)
    for (const tag of tags(row.content)) {
      if (!topics.has(tag)) topics.set(tag, new Map())
      const people = topics.get(tag)
      const old = people.get(row.author_id) || { count: 0, last: 0 }
      people.set(row.author_id, { count: old.count + 1, last: Math.max(old.last, row.created_at) })
    }
  }
  return [...topics].filter(([, people]) => people.size >= 2).map(([topic, people]) => ({
    topic, independentAuthors: people.size,
    humanDiscussionCount: [...people.values()].reduce((n, p) => n + Math.min(p.count, 3), 0),
    authors24h: [...people.values()].filter(p => now - p.last <= 86400000).length,
    score: [...people.values()].reduce((n, p) => n + Math.exp(-(now - p.last) / 86400000), 0)
  })).sort((a, b) => b.score - a.score).slice(0, 5)
}
module.exports = { hotTopics }
