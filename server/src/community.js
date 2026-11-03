'use strict'
const { randomUUID, randomBytes, createHash } = require('node:crypto')
const { transaction } = require('./db')
const { defaults } = require('./config')
const { probability, eligibility } = require('./ai/policy')
const { ingest, refreshMemories, revokePostSources } = require('./ai/memory')
const { hotTopics } = require('./ai/hotTopics')
const { tags, unsafeInput, privateText, sanitize } = require('./ai/safety')
const { promptVersion, mockModel } = require('./ai/versions')

class ApiError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code }
}
function fail(status, code, message) { throw new ApiError(status, code, message) }
function fields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !allowed.includes(k))) fail(400, 'invalid_fields', '请求包含不支持的字段')
}
function text(value, max, label, optional = false) {
  if (optional && (value === undefined || value === null || value === '')) return ''
  if (typeof value !== 'string' || !value.trim() || [...value.trim()].length > max) fail(400, 'invalid_text', label + '长度不合适')
  return value.trim()
}
function bool(value) { if (typeof value !== 'boolean') fail(400, 'invalid_boolean'); return value ? 1 : 0 }
function hash(token) { return createHash('sha256').update(token).digest('hex') }
function dayStart(now) { return Math.floor((now + 8 * 3600000) / 86400000) * 86400000 - 8 * 3600000 }

class Community {
  constructor({ db, config = {}, rng = Math.random, now = Date.now, mode = 'development', devControls = false, providerMode = 'mock', providerStatus = null }) {
    this.db = db; this.config = { ...defaults, ...config }; this.rng = rng; this.clock = now; this.offset = 0
    this.mode = mode; this.devControls = mode === 'development' && devControls; this.providerMode = providerMode
    this.providerStatus = providerStatus || { code: providerMode === 'mock' ? 'mock_only' : 'configured_unverified', configured: false }
    db.prepare("UPDATE users SET display_name=? WHERE id='bot-yellow'").run(this.config.botName)
  }
  now() { return this.clock() + this.offset }
  session(identity) {
    if (this.mode !== 'development') fail(404, 'not_found')
    if (!['A', 'B', 'C'].includes(identity)) fail(400, 'invalid_identity')
    const id = `dev-${identity}`, token = randomBytes(32).toString('hex')
    transaction(this.db, () => {
      this.db.prepare('INSERT OR IGNORE INTO users VALUES (?,?,?)').run(id, `体验用户 ${identity}`, 'human')
      this.db.prepare('INSERT OR IGNORE INTO user_preferences (user_id) VALUES (?)').run(id)
      this.db.prepare('INSERT INTO dev_sessions VALUES (?,?,?)').run(hash(token), id, this.now() + 7 * 86400000)
    })
    return { token, user: this.me(id), mode: this.providerMode, devControls: this.devControls }
  }
  authenticate(token) {
    // Real authentication is intentionally not implemented. Production cannot use dev sessions.
    if (this.mode !== 'development' || typeof token !== 'string' || token.length > 200) fail(401, 'unauthorized', '请先连接本地开发身份')
    const session = this.db.prepare('SELECT user_id FROM dev_sessions WHERE token_hash=? AND expires_at>?').get(hash(token), this.now())
    if (!session) fail(401, 'unauthorized', '本地会话已过期，请重新连接')
    return session.user_id
  }
  me(userId) {
    const user = this.db.prepare('SELECT id,display_name FROM users WHERE id=?').get(userId)
    if (!user) fail(401, 'unauthorized')
    return { id: user.id, displayName: user.display_name, aiEnabled: this.enabled(userId), providerMode: this.providerMode, aiStatus: this.providerStatus, devControls: this.devControls }
  }
  enabled(userId) { return this.db.prepare('SELECT enabled FROM user_preferences WHERE user_id=?').get(userId)?.enabled !== 0 }
  getPost(id) { const row = this.db.prepare('SELECT * FROM posts WHERE id=?').get(id); if (!row || row.status !== 'active') fail(404, 'post_not_found', '动态已删除或不存在'); return row }
  accessible(id, userId) { const post = this.getPost(id); if (post.visibility !== 'public' && post.author_id !== userId) fail(404, 'post_not_found'); return post }
  owned(id, userId) { const post = this.getPost(id); if (post.author_id !== userId) fail(403, 'forbidden', '只能修改自己的动态'); return post }
  stats(postId, userId, kind) {
    const db = this.db, now = this.now()
    return {
      kindCount: db.prepare('SELECT count(*) AS n FROM comments c JOIN ai_jobs j ON j.id=c.job_id WHERE c.post_id=? AND j.kind=?').get(postId, kind).n,
      dayCount: db.prepare('SELECT count(*) AS n FROM comments c JOIN ai_jobs j ON j.id=c.job_id WHERE j.target_user_id=? AND c.created_at>=?').get(userId, dayStart(now)).n,
      hourCount: db.prepare("SELECT count(*) AS n FROM comments WHERE author_type='ai' AND created_at>?").get(now - 3600000).n,
      lastAt: db.prepare('SELECT max(c.created_at) AS t FROM comments c JOIN ai_jobs j ON j.id=c.job_id WHERE j.target_user_id=? AND j.kind=?').get(userId, kind).t
    }
  }
  eligible(post, job) {
    if (this.db.prepare('SELECT author_type FROM users WHERE id=?').get(post.author_id)?.author_type !== 'human') return 'bot_author'
    if (job.created_at != null && this.now() - job.created_at > this.config.jobExpiresAfterHours * 3600000) return 'expired'
    if (post.version !== job.post_version) return 'version_changed'
    if (!this.enabled(post.author_id)) return 'disabled_author'
    if (job.source_comment_id) {
      const human = this.db.prepare("SELECT * FROM comments WHERE id=? AND post_id=? AND status='active' AND author_type='human'").get(job.source_comment_id, post.id)
      const parent = human && this.db.prepare("SELECT * FROM comments WHERE id=? AND post_id=? AND status='active' AND author_type='ai'").get(human.reply_to_comment_id, post.id)
      if (!parent || unsafeInput(human.content) || privateText(human.content)) return 'invalid_reply'
    }
    return eligibility({ post, config: this.config, kind: job.kind, now: this.now(), enabled: this.enabled(job.target_user_id),
      stats: this.stats(post.id, job.target_user_id, job.kind), forceTest: this.devControls && !!post.test_namespace && !!job.force_test })
  }
  decide(post, kind, userId, sourceCommentId = null, forceTest = false) {
    const eventId = kind === 'initial' ? `post:${post.id}` : `reply:${sourceCommentId}`
    const existing = this.db.prepare('SELECT * FROM ai_jobs WHERE post_id=? AND kind=?').get(post.id, kind)
    if (existing) return existing
    const now = this.now(), job = { post_version: post.version, kind, target_user_id: userId, source_comment_id: sourceCommentId, force_test: forceTest ? 1 : 0 }
    let reason = this.eligible(post, job)
    const relatedHot = hotTopics(this.db, now).some(h => tags(post.content).includes(h.topic))
    const chance = probability(post.content, kind, this.config, relatedHot)
    const roll = reason ? null : this.rng()
    if (!reason) reason = forceTest && this.devControls && post.test_namespace ? 'selected_test_override' : roll < chance ? 'selected' : 'random_miss'
    const selected = reason === 'selected' || reason === 'selected_test_override'
    const dueAt = now + (this.config.delaySecondsMin + this.rng() * (this.config.delaySecondsMax - this.config.delaySecondsMin)) * 1000
    const id = randomUUID()
    this.db.prepare(`INSERT INTO ai_jobs (id,event_id,post_id,source_comment_id,target_user_id,kind,decision,reason_code,probability,random_value,due_at,created_at,status,config_version,post_version,force_test,prompt_version,provider_mode,provider_model)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, eventId, post.id, sourceCommentId, userId, kind, selected ? 'selected' : 'skip', reason, chance, roll, Math.round(dueAt), now, selected ? 'pending' : 'skipped', this.config.version, post.version, job.force_test, promptVersion, this.providerMode, this.providerStatus.model || (this.providerMode === 'mock' ? mockModel : 'unconfigured'))
    return this.db.prepare('SELECT * FROM ai_jobs WHERE id=?').get(id)
  }
  createPost(userId, body) {
    if (this.db.prepare('SELECT author_type FROM users WHERE id=?').get(userId)?.author_type !== 'human') fail(403, 'human_required')
    fields(body, ['content', 'speciesName', 'observationId', 'visibility', 'memoryAllowed', 'requestKey', 'testNamespace', 'forceAI'])
    const content = text(body.content, 600, '动态'), requestKey = text(body.requestKey, 100, '请求标识')
    const speciesName = text(body.speciesName, 40, '物种', true), observationId = text(body.observationId, 100, '观察标识', true)
    if (privateText(content) || privateText(speciesName)) fail(400, 'private_content', '请去除精确地点、联系方式或私人信息后分享')
    if (body.visibility !== undefined && !['public', 'private'].includes(body.visibility)) fail(400, 'invalid_visibility')
    const memoryAllowed = body.memoryAllowed === undefined ? 1 : bool(body.memoryAllowed)
    const namespace = body.testNamespace === undefined ? null : text(body.testNamespace, 80, '测试命名空间')
    if ((namespace || body.forceAI !== undefined) && !this.devControls) fail(403, 'dev_controls_disabled')
    if (namespace && !/^demo:[a-zA-Z0-9_-]{1,60}$/.test(namespace)) fail(400, 'invalid_namespace')
    if (body.forceAI !== undefined) bool(body.forceAI)
    if (body.forceAI && !namespace) fail(400, 'force_requires_test_data')
    return transaction(this.db, () => {
      const prior = this.db.prepare('SELECT * FROM posts WHERE author_id=? AND request_key=?').get(userId, requestKey)
      if (prior) {
        if (prior.status !== 'active') fail(409, 'request_already_deleted')
        if (prior.content !== content || prior.species_name !== speciesName || (prior.observation_id || '') !== observationId || prior.memory_allowed !== memoryAllowed || prior.visibility !== (body.visibility || 'public')) fail(409, 'idempotency_conflict', '重试请求内容已改变，请重新发布')
        return this.presentPost(prior, userId)
      }
      const now = this.now(), id = randomUUID()
      this.db.prepare(`INSERT INTO posts (id,author_id,content,species_name,observation_id,visibility,memory_allowed,created_at,updated_at,request_key,test_namespace) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, userId, content, speciesName, observationId || null, body.visibility || 'public', memoryAllowed, now, now, requestKey, namespace)
      const post = this.getPost(id)
      ingest(this.db, post, null, now, this.config)
      this.decide(post, 'initial', userId, null, !!body.forceAI)
      return this.presentPost(post, userId)
    })
  }
  patchPost(userId, id, body) {
    fields(body, ['content', 'visibility', 'memoryAllowed'])
    return transaction(this.db, () => {
      const post = this.owned(id, userId)
      const content = body.content === undefined ? post.content : text(body.content, 600, '动态')
      if (privateText(content)) fail(400, 'private_content')
      const visibility = body.visibility === undefined ? post.visibility : body.visibility
      if (!['public', 'private'].includes(visibility)) fail(400, 'invalid_visibility')
      const memoryAllowed = body.memoryAllowed === undefined ? post.memory_allowed : bool(body.memoryAllowed)
      revokePostSources(this.db, id)
      this.db.prepare('UPDATE posts SET content=?,visibility=?,memory_allowed=?,version=version+1,updated_at=? WHERE id=?').run(content, visibility, memoryAllowed, this.now(), id)
      this.db.prepare("UPDATE ai_jobs SET status='cancelled',reason_code='post_changed',lease_token=NULL WHERE post_id=? AND status IN ('pending','running')").run(id)
      const updated = this.getPost(id)
      ingest(this.db, updated, null, this.now(), this.config)
      for (const comment of this.db.prepare("SELECT * FROM comments WHERE post_id=? AND author_type='human' AND status='active'").all(id)) ingest(this.db, updated, comment, this.now(), this.config)
      refreshMemories(this.db, this.now())
      return this.presentPost(updated, userId)
    })
  }
  deletePost(userId, id) {
    return transaction(this.db, () => {
      this.owned(id, userId)
      this.db.prepare("UPDATE posts SET status='deleted',version=version+1,updated_at=? WHERE id=?").run(this.now(), id)
      this.db.prepare("UPDATE ai_jobs SET status='cancelled',reason_code='post_deleted',lease_token=NULL WHERE post_id=? AND status IN ('pending','running')").run(id)
      revokePostSources(this.db, id); refreshMemories(this.db, this.now())
      return { deleted: true }
    })
  }
  comments(userId, postId) {
    this.accessible(postId, userId)
    return this.db.prepare(`SELECT c.id,c.content,c.author_type,c.author_id,u.display_name,c.created_at,c.reply_to_comment_id,j.provider_mode FROM comments c JOIN users u ON u.id=c.author_id LEFT JOIN ai_jobs j ON j.id=c.job_id
      WHERE c.post_id=? AND c.status='active' AND NOT EXISTS (SELECT 1 FROM comment_hidden h WHERE h.comment_id=c.id AND h.user_id=?) ORDER BY c.created_at,c.rowid`).all(postId, userId)
      .map(c => ({ id: c.id, content: sanitize(c.content), authorType: c.author_type, displayName: c.display_name, isMine: c.author_id === userId,
        createdAt: c.created_at, replyToCommentId: c.reply_to_comment_id, avatarColor: c.author_type === 'ai' ? '#FFD84D' : null, providerMode: c.provider_mode || null }))
  }
  addComment(userId, postId, body) {
    if (this.db.prepare('SELECT author_type FROM users WHERE id=?').get(userId)?.author_type !== 'human') fail(403, 'human_required')
    fields(body, ['content', 'replyToCommentId', 'requestKey', 'forceAI'])
    const content = text(body.content, 300, '评论'), requestKey = text(body.requestKey, 100, '请求标识')
    if (privateText(content)) fail(400, 'private_content', '请去除私人信息或精确位置')
    const replyId = text(body.replyToCommentId, 100, '回复标识', true) || null
    if (body.forceAI !== undefined) bool(body.forceAI)
    return transaction(this.db, () => {
      const post = this.accessible(postId, userId)
      if (post.visibility !== 'public') fail(409, 'post_not_public')
      if (body.forceAI && !(this.devControls && post.test_namespace)) fail(403, 'force_requires_test_data')
      const parent = replyId && this.db.prepare("SELECT * FROM comments WHERE id=? AND post_id=? AND status='active'").get(replyId, postId)
      if (replyId && !parent) fail(400, 'invalid_reply')
      const prior = this.db.prepare('SELECT * FROM comments WHERE post_id=? AND author_id=? AND request_key=?').get(postId, userId, requestKey)
      if (prior) {
        if (prior.content !== content || prior.reply_to_comment_id !== replyId) fail(409, 'idempotency_conflict')
        return { id: prior.id }
      }
      const id = randomUUID()
      this.db.prepare("INSERT INTO comments (id,post_id,author_id,author_type,content,created_at,reply_to_comment_id,request_key) VALUES (?,?,?,'human',?,?,?,?)").run(id, postId, userId, content, this.now(), replyId, requestKey)
      const comment = this.db.prepare('SELECT * FROM comments WHERE id=?').get(id)
      ingest(this.db, post, comment, this.now(), this.config)
      if (parent && parent.author_type === 'ai') this.decide(post, 'followup', userId, id, !!body.forceAI)
      return { id }
    })
  }
  react(userId, postId, type, body) {
    fields(body, ['active']); if (!['like', 'seen'].includes(type)) fail(400, 'invalid_reaction')
    const active = bool(body.active)
    return transaction(this.db, () => {
      const post = this.accessible(postId, userId)
      if (post.visibility !== 'public') fail(409, 'post_not_public')
      if (active) this.db.prepare('INSERT OR IGNORE INTO reactions VALUES (?,?,?)').run(postId, userId, type)
      else this.db.prepare('DELETE FROM reactions WHERE post_id=? AND user_id=? AND type=?').run(postId, userId, type)
      return this.presentPost(post, userId)
    })
  }
  preferences(userId, body) {
    fields(body, ['enabled']); const enabled = bool(body.enabled)
    return transaction(this.db, () => {
      this.db.prepare('INSERT INTO user_preferences (user_id,enabled) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled').run(userId, enabled)
      if (!enabled) this.db.prepare("UPDATE ai_jobs SET status='cancelled',reason_code='disabled_user',lease_token=NULL WHERE status IN ('pending','running') AND (target_user_id=? OR post_id IN (SELECT id FROM posts WHERE author_id=?))").run(userId, userId)
      return this.me(userId)
    })
  }
  feedback(userId, commentId, body) {
    fields(body, ['reason', 'hide']); const reason = text(body.reason, 200, '反馈')
    const hide = body.hide === undefined ? false : !!bool(body.hide)
    return transaction(this.db, () => {
      const comment = this.db.prepare("SELECT * FROM comments WHERE id=? AND author_type='ai' AND status='active'").get(commentId)
      if (!comment) fail(404, 'comment_not_found')
      this.accessible(comment.post_id, userId)
      this.db.prepare('INSERT INTO feedback VALUES (?,?,?,?,?)').run(randomUUID(), commentId, userId, reason, this.now())
      if (hide) this.db.prepare('INSERT OR IGNORE INTO comment_hidden VALUES (?,?)').run(commentId, userId)
      return { recorded: true, hidden: hide }
    })
  }
  clearTestNamespace(namespace) {
    if (!this.devControls || !/^demo:[a-zA-Z0-9_-]{1,60}$/.test(namespace)) fail(403, 'invalid_test_namespace')
    return transaction(this.db, () => {
      const rows = this.db.prepare('SELECT id FROM posts WHERE test_namespace=?').all(namespace)
      for (const row of rows) {
        revokePostSources(this.db, row.id)
        // Only children of the explicitly selected test posts are removed.
        this.db.prepare('DELETE FROM ai_comment_sources WHERE comment_id IN (SELECT id FROM comments WHERE post_id=?)').run(row.id)
        this.db.prepare('DELETE FROM comment_hidden WHERE comment_id IN (SELECT id FROM comments WHERE post_id=?)').run(row.id)
        this.db.prepare('DELETE FROM feedback WHERE comment_id IN (SELECT id FROM comments WHERE post_id=?)').run(row.id)
        this.db.prepare('DELETE FROM provider_calls WHERE job_id IN (SELECT id FROM ai_jobs WHERE post_id=?)').run(row.id)
        this.db.prepare('DELETE FROM ai_jobs WHERE post_id=?').run(row.id)
        this.db.prepare('DELETE FROM memory_sources WHERE post_id=?').run(row.id)
        this.db.prepare('DELETE FROM comments WHERE post_id=?').run(row.id)
        this.db.prepare('DELETE FROM reactions WHERE post_id=?').run(row.id)
        this.db.prepare('DELETE FROM posts WHERE id=?').run(row.id)
      }
      refreshMemories(this.db, this.now())
      this.db.prepare('DELETE FROM community_memories WHERE NOT EXISTS (SELECT 1 FROM memory_sources s WHERE s.memory_id=community_memories.id)').run()
      return { deleted: rows.length, namespace }
    })
  }
  presentPost(post, userId) {
    const reactions = this.db.prepare('SELECT type,count(*) AS n FROM reactions WHERE post_id=? GROUP BY type').all(post.id)
    const own = this.db.prepare('SELECT type FROM reactions WHERE post_id=? AND user_id=?').all(post.id, userId)
    return { id: post.id, content: sanitize(post.content), speciesName: post.species_name, observationId: post.author_id === userId ? post.observation_id : null,
      displayName: this.db.prepare('SELECT display_name FROM users WHERE id=?').get(post.author_id).display_name,
      createdAt: post.created_at, visibility: post.visibility, memoryAllowed: !!post.memory_allowed, version: post.version,
      isMine: post.author_id === userId, liked: own.some(r => r.type === 'like'), seen: own.some(r => r.type === 'seen'),
      likeCount: reactions.find(r => r.type === 'like')?.n || 0, seenCount: reactions.find(r => r.type === 'seen')?.n || 0,
      comments: this.comments(userId, post.id), testNamespace: post.test_namespace }
  }
  posts(userId, { before = '', limit = 20, mine = false, observationId = '' } = {}) {
    limit = Number(limit)
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) fail(400, 'invalid_limit')
    let cursor = null
    if (before) {
      try { cursor = JSON.parse(Buffer.from(before, 'base64url').toString('utf8')) } catch { fail(400, 'invalid_cursor') }
      if (!Array.isArray(cursor) || cursor.length !== 2 || !Number.isFinite(cursor[0]) || !Number.isInteger(cursor[1])) fail(400, 'invalid_cursor')
    }
    const rows = this.db.prepare(`SELECT rowid AS row_number,* FROM posts WHERE status='active' AND (visibility='public' OR (?=1 AND author_id=?))
      AND (?=0 OR author_id=?) AND (?='' OR (author_id=? AND observation_id=?))
      AND (? IS NULL OR created_at<? OR (created_at=? AND rowid<?)) ORDER BY created_at DESC,rowid DESC LIMIT ?`)
      .all(mine ? 1 : 0, userId, mine ? 1 : 0, userId, observationId, userId, observationId, cursor?.[0] ?? null, cursor?.[0] ?? null, cursor?.[0] ?? null, cursor?.[1] ?? null, limit + 1)
    const page = rows.slice(0, limit), last = page.at(-1)
    return { posts: page.map(p => this.presentPost(p, userId)), nextCursor: rows.length > limit ? Buffer.from(JSON.stringify([last.created_at, last.row_number])).toString('base64url') : null, providerMode: this.providerMode, aiStatus: this.providerStatus }
  }
}
module.exports = { Community, ApiError, fail, fields, text, dayStart }
