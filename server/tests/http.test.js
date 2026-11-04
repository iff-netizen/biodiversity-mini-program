const test = require('node:test')
const assert = require('node:assert/strict')
const { setup } = require('./helpers')

async function client(t, options) {
  const x = setup(t, options)
  await new Promise(resolve => x.server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${x.server.address().port}`
  async function call(route, method = 'GET', body, token, extraHeaders = {}) {
    const response = await fetch(base + route, { method, headers: { 'content-type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...extraHeaders }, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: response.status, body: await response.json() }
  }
  return { ...x, call }
}

test('HTTP identity authorization, forgery, pagination, preferences and diagnostics', async t => {
  const x = await client(t)
  assert.equal((await x.call('/health')).body.providerMode, 'mock')
  assert.equal((await x.call('/dev/ai/jobs')).status, 401)
  const a = (await x.call('/dev/sessions', 'POST', { identity: 'A' })).body.token
  const b = (await x.call('/dev/sessions', 'POST', { identity: 'B' })).body.token
  for (const field of ['authorType', 'authorId', 'latitude', 'imagePath']) {
    assert.equal((await x.call('/posts', 'POST', { content: '普通帖子', requestKey: field, [field]: 'fake' }, a)).status, 400)
  }
  const p = (await x.call('/posts', 'POST', { content: '今天风很轻', requestKey: 'post' }, a)).body
  assert.equal((await x.call('/posts/' + p.id, 'DELETE', undefined, b)).status, 403)
  assert.equal((await x.call('/posts/' + p.id, 'PATCH', { visibility: 'private' }, b)).status, 403)
  assert.equal((await x.call('/posts?limit=0', 'GET', undefined, a)).status, 400)
  x.post('B', '第一次看见花间的蝴蝶')
  const page = (await x.call('/posts?limit=1', 'GET', undefined, a)).body
  assert.ok(page.nextCursor)
  const next = (await x.call('/posts?limit=1&before=' + encodeURIComponent(page.nextCursor), 'GET', undefined, a)).body
  assert.notEqual(page.posts[0].id, next.posts[0].id)
  assert.equal((await x.call('/dev/ai/jobs', 'GET', undefined, a)).status, 200)
  assert.equal((await x.call('/dev/ai/memories', 'GET', undefined, a)).status, 200)
  await x.call('/me/ai-preferences', 'PUT', { enabled: false }, a)
  assert.equal((await x.call('/me', 'GET', undefined, a)).body.aiEnabled, false)
  assert.equal((await x.call('/posts', 'GET', undefined, a, { Origin: 'https://hostile.example' })).status, 403)
})

test('private post hidden from B, hidden AI comments scoped per user, feedback recorded', async t => {
  const x = await client(t), p = x.post()
  await x.worker.drain()
  const ai = x.community.comments('dev-A', p.id)[0]
  x.community.feedback('dev-B', ai.id, { reason: '隐藏', hide: true })
  assert.equal(x.community.comments('dev-B', p.id).length, 0)
  assert.equal(x.community.comments('dev-A', p.id).length, 1)
  assert.equal(x.db.prepare('SELECT count(*) n FROM feedback').get().n, 1)
  x.community.patchPost('dev-A', p.id, { visibility: 'private' })
  assert.equal(x.community.posts('dev-B').posts.length, 0)
  assert.equal(x.community.posts('dev-A').posts.length, 0)
  assert.equal(x.community.posts('dev-A', { mine: true }).posts.length, 1)
  assert.throws(() => x.community.comments('dev-B', p.id), /post_not_found/)
})

test('dev controls only force namespaced fixtures; clean preserves ordinary posts', async t => {
  const x = await client(t), token = (await x.call('/dev/sessions', 'POST', { identity: 'A' })).body.token
  assert.equal((await x.call('/posts', 'POST', { content: '测试一下', requestKey: 'force', forceAI: true }, token)).status, 400)
  const normal = x.post(), fixture = x.post('A', '今天的鸟叫像合唱', { testNamespace: 'demo:test', forceAI: true })
  await x.call('/dev/ai/control', 'POST', { advanceMs: 60000, randomSeed: 1 }, token)
  assert.ok(x.community.comments('dev-A', fixture.id).some(c => c.authorType === 'ai'))
  assert.equal((await x.call('/dev/test-data', 'DELETE', { namespace: '' }, token)).status, 400)
  assert.equal((await x.call('/dev/test-data', 'DELETE', { namespace: 'demo:test' }, token)).body.deleted, 1)
  assert.equal(x.community.getPost(normal.id).status, 'active')
  assert.equal(x.db.prepare('SELECT count(*) n FROM ai_jobs WHERE post_id=?').get(fixture.id).n, 0)
  assert.ok(x.post('A', '今天的鸟叫像合唱', { requestKey: 'reusable', testNamespace: 'demo:test', forceAI: true }))
})

test('production disables dev sessions and tokens; controls opt-in in development', async t => {
  // setup creates test users via sessions, so production mode is applied after setup.
  const x = await client(t); const token = x.community.session('A').token; x.community.mode = 'production'
  for (const route of ['/dev/sessions', '/dev/ai/jobs', '/dev/ai/control', '/dev/ai/memories']) assert.equal((await x.call(route, route.includes('sessions') || route.includes('control') ? 'POST' : 'GET', undefined, token)).status, 404)
  assert.equal((await x.call('/posts', 'GET', undefined, token)).status, 401)
  const y = await client(t, { devControls: false }), other = y.community.session('A').token
  assert.equal((await y.call('/dev/ai/control', 'POST', { advanceMs: 0 }, other)).status, 403)
})
