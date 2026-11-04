'use strict'
const http = require('node:http')
const { Community, ApiError, fail, fields } = require('./community')
const { Worker } = require('./ai/worker')
const { MockProvider } = require('./ai/providers/mock')
const { hotTopics } = require('./ai/hotTopics')
const { refreshMemories } = require('./ai/memory')
const { seededRandom } = require('./config')

function loopback(address) { return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address) }
async function readBody(req) {
  let size = 0, chunks = []
  for await (const chunk of req) { size += chunk.length; if (size > 16384) fail(413, 'body_too_large'); chunks.push(chunk) }
  try { return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {} }
  catch { fail(400, 'invalid_json', '请求必须是 JSON') }
}
function createApp(options) {
  const provider = options.provider || new MockProvider()
  const community = new Community({ ...options, providerMode: provider.mode || options.providerMode || 'mock', providerStatus: provider.status ? provider.status() : { code: 'mock_only', configured: false } })
  if (provider.status) Object.defineProperty(community, 'providerStatus', { get: () => provider.status() })
  const worker = new Worker(community, provider)
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    try {
      // Prevent cross-site requests into a local developer service. wx.request has no Origin.
      if (req.headers.origin) {
        const origin = new URL(req.headers.origin)
        if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) fail(403, 'origin_forbidden')
      }
      const url = new URL(req.url, 'http://localhost'), route = decodeURIComponent(url.pathname), method = req.method
      const local = loopback(req.socket.remoteAddress)
      if (route === '/health' && method === 'GET') return send({ ok: true, mode: community.mode, providerMode: provider.mode, aiStatus: community.providerStatus, policyVersion: community.config.version, postProbability: community.config.postBaseProbability, devControls: community.devControls })
      if (route.startsWith('/dev/') && (!local || community.mode !== 'development')) fail(404, 'not_found')
      if (route === '/dev/sessions' && method === 'POST') {
        const body = await readBody(req); fields(body, ['identity']); return send(community.session(body.identity), 201)
      }
      const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1]
      const userId = community.authenticate(token)
      if (route === '/me' && method === 'GET') return send(community.me(userId))
      if (route === '/posts' && method === 'GET') return send(community.posts(userId, {
        before: url.searchParams.get('before') || '', limit: url.searchParams.get('limit') || 20,
        mine: url.searchParams.get('mine') === 'true', observationId: url.searchParams.get('observationId') || ''
      }))
      if (route === '/posts' && method === 'POST') return send(community.createPost(userId, await readBody(req)), 201)
      if (route === '/me/ai-preferences' && method === 'PUT') return send(community.preferences(userId, await readBody(req)))
      let match = route.match(/^\/posts\/([^/]+)$/)
      if (match && method === 'PATCH') return send(community.patchPost(userId, match[1], await readBody(req)))
      if (match && method === 'DELETE') return send(community.deletePost(userId, match[1]))
      match = route.match(/^\/posts\/([^/]+)\/comments$/)
      if (match && method === 'GET') return send({ comments: community.comments(userId, match[1]) })
      if (match && method === 'POST') return send(community.addComment(userId, match[1], await readBody(req)), 201)
      match = route.match(/^\/posts\/([^/]+)\/reactions\/([^/]+)$/)
      if (match && method === 'PUT') return send(community.react(userId, match[1], match[2], await readBody(req)))
      match = route.match(/^\/comments\/([^/]+)\/feedback$/)
      if (match && method === 'POST') return send(community.feedback(userId, match[1], await readBody(req)), 201)
      if (route === '/dev/ai/jobs' && method === 'GET') {
        return send({ jobs: community.db.prepare(`SELECT id,event_id,post_id,source_comment_id,kind,decision,reason_code,probability,random_value,due_at,status,attempts,lease_until,config_version,post_version,force_test,memory_ids,source_ids,latency_ms,error_category,prompt_version,usage_json,provider_mode,provider_model FROM ai_jobs ORDER BY created_at DESC,rowid DESC LIMIT 100`).all(), providerMode: provider.mode })
      }
      if (route === '/dev/ai/memories' && method === 'GET') {
        refreshMemories(community.db, community.now())
        return send({ memories: community.db.prepare("SELECT * FROM community_memories WHERE status='active' AND expires_at>? ORDER BY created_at DESC LIMIT 100").all(community.now())
          .map(m => ({ ...m, sources: community.db.prepare('SELECT source_id,post_id,comment_id FROM memory_sources WHERE memory_id=?').all(m.id) })), hotTopics: hotTopics(community.db, community.now()) })
      }
      if (route === '/dev/ai/control' && method === 'POST') {
        if (!community.devControls) fail(403, 'dev_controls_disabled')
        const body = await readBody(req); fields(body, ['advanceMs', 'randomSeed'])
        if (body.advanceMs !== undefined && (!Number.isInteger(body.advanceMs) || body.advanceMs < 0 || body.advanceMs > 86400000)) fail(400, 'invalid_advance')
        if (body.randomSeed !== undefined && !Number.isInteger(body.randomSeed)) fail(400, 'invalid_seed')
        if (body.randomSeed !== undefined) community.rng = seededRandom(body.randomSeed)
        community.offset += body.advanceMs || 0
        return send({ ...await worker.drain(), now: community.now() })
      }
      if (route === '/dev/test-data' && method === 'DELETE') {
        if (!community.devControls) fail(403, 'dev_controls_disabled')
        const body = await readBody(req); fields(body, ['namespace'])
        if (typeof body.namespace !== 'string' || !/^demo:[a-zA-Z0-9_-]{1,60}$/.test(body.namespace)) fail(400, 'invalid_namespace')
        return send(community.clearTestNamespace(body.namespace))
      }
      fail(404, 'not_found', '接口不存在')
    } catch (error) {
      const known = error instanceof ApiError
      send({ error: { code: known ? error.code : 'internal_error', message: known ? error.message : '本地服务暂时不可用' } }, known ? error.status : 500)
    }
    function send(data, status = 200) { if (!res.writableEnded) { res.writeHead(status); res.end(JSON.stringify(data)) } }
  })
  server.requestTimeout = 20000
  return { server, community, worker, provider }
}
module.exports = { createApp, loopback }
