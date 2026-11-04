'use strict'
const { randomUUID } = require('node:crypto')
const { transaction } = require('../db')
const { buildContext } = require('./promptBuilder')
const { validateOutput } = require('./validateOutput')
const { sourceValid } = require('./memory')
const { promptVersion } = require('./versions')

class Worker {
  constructor(community, provider) { this.community = community; this.db = community.db; this.provider = provider; this.busy = false }
  finish(job, status, reason) {
    return this.db.prepare('UPDATE ai_jobs SET status=?,reason_code=?,lease_until=NULL,lease_token=NULL WHERE id=? AND lease_token=?')
      .run(status, reason, job.id, job.lease_token)
  }
  claim() {
    const service = this.community, db = this.db, now = service.now(), config = service.config
    return transaction(db, () => {
      db.prepare("UPDATE ai_jobs SET status='expired',reason_code='expired',lease_token=NULL WHERE status IN ('pending','running') AND created_at<?").run(now - config.jobExpiresAfterHours * 3600000)
      db.prepare("UPDATE ai_jobs SET status='pending',lease_token=NULL,lease_until=NULL WHERE status='running' AND lease_until<=?").run(now)
      const job = db.prepare("SELECT * FROM ai_jobs WHERE status='pending' AND due_at<=? ORDER BY due_at,rowid LIMIT 1").get(now)
      if (!job) return null
      const post = db.prepare('SELECT * FROM posts WHERE id=?').get(job.post_id)
      const reason = service.eligible(post, job)
      if (reason || job.attempts >= config.maxProviderAttemptsPerJob) {
        db.prepare("UPDATE ai_jobs SET status='skipped',reason_code=? WHERE id=?").run(reason || 'attempt_limit', job.id)
        return { ignored: true }
      }
      const calls = db.prepare('SELECT count(*) AS n FROM provider_calls WHERE created_at>?').get(now - 3600000).n
      if (calls >= config.maxProviderCallsGlobalPerHour) {
        db.prepare("UPDATE ai_jobs SET status='skipped',reason_code='provider_budget' WHERE id=?").run(job.id)
        return { ignored: true }
      }
      job.lease_token = randomUUID(); job.attempts++
      db.prepare('UPDATE ai_jobs SET provider_mode=?,provider_model=?,prompt_version=? WHERE id=?').run(this.provider.mode || 'mock', this.provider.model || 'test-provider', promptVersion, job.id)
      db.prepare("UPDATE ai_jobs SET status='running',attempts=?,lease_token=?,lease_until=? WHERE id=? AND status='pending'")
        .run(job.attempts, job.lease_token, now + config.leaseMs, job.id)
      db.prepare('INSERT INTO provider_calls VALUES (?,?,?)').run(randomUUID(), job.id, now)
      return { ...job, post }
    })
  }
  async runOne() {
    const job = this.claim()
    if (!job) return false
    if (job.ignored) return true
    const service = this.community, db = this.db, started = Date.now()
    let timer
    const controller = new AbortController()
    try {
      const context = buildContext(db, job.post, job, service.now(), service.rng)
      db.prepare('UPDATE ai_jobs SET memory_ids=?,source_ids=? WHERE id=? AND lease_token=?')
        .run(JSON.stringify(context.communityMemories.map(m => m.id)), JSON.stringify(context.sourceIds), job.id, job.lease_token)
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('provider_timeout')) }, service.config.providerTimeoutMs)
      })
      const raw = await Promise.race([this.provider.generateComment(context, { signal: controller.signal }), timeout])
      clearTimeout(timer)
      const output = validateOutput(raw && Object.hasOwn(raw, 'output') ? raw.output : raw, context)
      transaction(db, () => {
        const current = db.prepare('SELECT * FROM ai_jobs WHERE id=?').get(job.id)
        if (!current || current.status !== 'running' || current.lease_token !== job.lease_token) return
        const post = db.prepare('SELECT * FROM posts WHERE id=?').get(job.post_id)
        const reason = service.eligible(post, job)
        if (reason) { this.finish(job, 'cancelled', reason); return }
        const sourceIds = [...new Set(context.communityMemories.filter(m => output.usedMemoryIds.includes(m.id)).flatMap(m => m.sourceIds))]
        if (context.sourceIds.some(id => !sourceValid(db, id, service.now()))) { this.finish(job, 'cancelled', 'source_revoked'); return }
        // Concurrent workers may have published the same prose while this call ran.
        context.recentBotComments = db.prepare("SELECT content FROM comments WHERE author_type='ai' AND status='active' ORDER BY created_at DESC LIMIT 12").all().map(c => c.content)
        validateOutput(output, context)
        db.prepare('UPDATE ai_jobs SET latency_ms=?,usage_json=?,error_category=NULL WHERE id=?').run(Date.now() - started, raw?.usage ? JSON.stringify(raw.usage) : null, job.id)
        if (output.action === 'skip') { this.finish(job, 'skipped', output.reasonCode); return }
        const id = randomUUID()
        db.prepare("INSERT INTO comments (id,post_id,author_id,author_type,content,created_at,reply_to_comment_id,request_key,job_id) VALUES (?,?,'bot-yellow','ai',?,?,?,?,?)")
          .run(id, post.id, output.text, service.now(), job.source_comment_id, `job:${job.id}`, job.id)
        // A model may paraphrase a retrieved memory without declaring its ID.
        // Conservatively withdraw on any context source being revoked.
        const inheritedSources = context.comments.filter(c => c.authorType === 'ai').flatMap(c =>
          db.prepare('SELECT source_id FROM ai_comment_sources WHERE comment_id=?').all(c.id).map(row => row.source_id))
        const dependencies = new Set([...context.sourceIds, ...sourceIds, ...inheritedSources, `p:${post.id}:v${post.version}`,
          ...context.comments.filter(c => c.authorType === 'human').map(c => `c:${c.id}:v${post.version}`)])
        for (const sourceId of dependencies) db.prepare('INSERT INTO ai_comment_sources VALUES (?,?)').run(id, sourceId)
        this.finish(job, 'completed', 'published')
      })
    } catch (error) {
      clearTimeout(timer); controller.abort()
      // Store categories only, never provider response bodies or credentials.
      const known = /^(?:invalid_\w+|forged_source|unsafe_output|unproven_\w+|unverified_science|near_duplicate|canned_response|truncated_echo|post_echo|too_many_emoji|provider_(?:429|timeout|empty|refusal|truncated|insufficient_balance|http_\d+)|missing_credentials)$/
      const category = known.test(error.message) ? error.message : 'provider_network'
      transaction(db, () => {
        const current = db.prepare('SELECT * FROM ai_jobs WHERE id=?').get(job.id)
        if (!current || current.status !== 'running' || current.lease_token !== job.lease_token) return
        const canRetry = job.attempts < service.config.maxProviderAttemptsPerJob && !['missing_credentials', 'provider_insufficient_balance', 'provider_http_401', 'provider_http_403'].includes(category)
        db.prepare('UPDATE ai_jobs SET status=?,reason_code=?,error_category=?,latency_ms=?,due_at=?,lease_until=NULL,lease_token=NULL WHERE id=? AND lease_token=?')
          .run(canRetry ? 'pending' : 'skipped', canRetry ? 'retry_scheduled' : 'provider_failed', category, Date.now() - started,
            service.now() + 2 ** job.attempts * 1000, job.id, job.lease_token)
      })
    }
    return true
  }
  async drain(limit = 30) {
    if (this.busy) return { busy: true }
    this.busy = true
    let processed = 0
    try { while (processed < limit && await this.runOne()) processed++; return { processed } }
    finally { this.busy = false }
  }
}
module.exports = { Worker }
