'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { retrieve } = require('./memory')
const { hotTopics } = require('./hotTopics')
const { sanitize, tags } = require('./safety')
const { chooseStyle } = require('./policy')
const { promptVersion } = require('./versions')
const { repairHint } = require('./repairHints')
const facts = require('../../data/verified-facts.json')
const systemPrompt = fs.readFileSync(path.join(__dirname, '../../prompts/community-bot.md'), 'utf8')
function buildContext(db, post, job, now, rng) {
  const reply = job.source_comment_id && db.prepare("SELECT * FROM comments WHERE id=? AND post_id=? AND author_type='human' AND status='active'").get(job.source_comment_id, post.id)
  const targetText = reply ? reply.content : post.content
  const communityMemories = retrieve(db, reply ? { ...post, content: targetText, author_id: reply.author_id } : post, now)
  const relatedTags = tags(targetText)
  const verifiedFacts = facts.filter(f => f.status === 'verified' && f.topicTags.some(t => relatedTags.includes(t)))
  const requiredIds = reply ? [reply.id, reply.reply_to_comment_id].filter(Boolean) : []
  const rows = db.prepare("SELECT id,content,author_type,reply_to_comment_id FROM comments WHERE post_id=? AND status='active' ORDER BY created_at DESC,rowid DESC LIMIT 8").all(post.id)
  for (const id of requiredIds) if (!rows.some(row => row.id === id)) {
    const required = db.prepare("SELECT id,content,author_type,reply_to_comment_id FROM comments WHERE id=? AND post_id=? AND status='active'").get(id, post.id)
    if (required) rows.push(required)
  }
  const selected = [...rows.filter(row => requiredIds.includes(row.id)), ...rows.filter(row => !requiredIds.includes(row.id))].slice(0, 8)
  const comments = selected.reverse()
    .map(c => ({ id: c.id, content: sanitize(c.content), authorType: c.author_type, replyToCommentId: c.reply_to_comment_id }))
  return {
    characterName: db.prepare("SELECT display_name FROM users WHERE id='bot-yellow'").get().display_name,
    currentPost: { id: post.id, content: sanitize(post.content), speciesName: sanitize(post.species_name), speciesStatus: post.species_name ? 'user_reported_not_expert_verified' : 'unknown', imageInput: false },
    comments, replyToCommentId: job.source_comment_id, communityMemories,
    verifiedFacts: verifiedFacts.map(({ id, text, sourceUrl, approvedTexts }) => ({ id, text, sourceUrl, approvedTexts })),
    hotTopics: hotTopics(db, now).filter(h => relatedTags.includes(h.topic)),
    styleHint: chooseStyle(targetText, communityMemories.length > 0, verifiedFacts.length > 0, rng()),
    recentBotComments: db.prepare("SELECT content FROM comments WHERE author_type='ai' AND status='active' ORDER BY created_at DESC LIMIT 12").all().map(c => sanitize(c.content)),
    sourceIds: communityMemories.flatMap(m => m.sourceIds), promptVersion,
    repairHint: repairHint(job.error_category)
  }
}
module.exports = { buildContext, systemPrompt, facts }
