'use strict'
const fs = require('node:fs')
const path = require('node:path')
const base = 'http://127.0.0.1:8787', namespace = 'demo:ai-v1'
async function call(route, method, body, token) {
  const r = await fetch(base + route, { method, headers: { 'content-type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error?.message || `HTTP ${r.status}`)
  return data
}
async function main() {
  const health = await call('/health', 'GET')
  if (!health.devControls || health.mode !== 'development') throw new Error('Set DEV_CONTROLS=true in local server/.env and restart first')
  const sessions = {}
  for (const identity of ['A', 'B', 'C']) sessions[identity] = await call('/dev/sessions', 'POST', { identity })
  const token = sessions.A.token
  if (process.argv.includes('--clean')) {
    console.log(await call('/dev/test-data', 'DELETE', { namespace }, token)); return
  }
  await call('/dev/ai/control', 'POST', { randomSeed: 20261103 }, token)
  const a = await call('/posts', 'POST', { content: '早上鸟叫像在点名', requestKey: 'demo-v1-a', testNamespace: namespace, forceAI: true }, token)
  await call('/dev/ai/control', 'POST', { advanceMs: 60000 }, token)
  const b = await call('/posts', 'POST', { content: '今天早晨的鸟叫又像校园晨间广播', requestKey: 'demo-v1-b', testNamespace: namespace, forceAI: true }, sessions.B.token)
  await call('/dev/ai/control', 'POST', { advanceMs: 60000 }, token)
  if (process.argv.includes('--scenarios')) {
    const fixtures = require('../fixtures/tone-posts.json').slice(2, 14)
    for (let i = 0; i < fixtures.length; i++) await call('/posts', 'POST', { content: fixtures[i].content, requestKey: 'scenario-v1-' + i, testNamespace: namespace }, sessions[['A', 'B', 'C'][i % 3]].token)
    await call('/dev/ai/control', 'POST', { advanceMs: 60000 }, token)
  }
  const comments = (await call(`/posts/${b.id}/comments`, 'GET', undefined, token)).comments
  if (process.argv.includes('--reply') && comments.find(c => c.authorType === 'ai')) {
    await call(`/posts/${b.id}/comments`, 'POST', { content: '这回真的像是集体早读，笑醒了', requestKey: 'demo-v1-reply', replyToCommentId: comments.find(c => c.authorType === 'ai').id, forceAI: true }, sessions.B.token)
    await call('/dev/ai/control', 'POST', { advanceMs: 60000 }, token)
  }
  const jobs = await call('/dev/ai/jobs', 'GET', undefined, token)
  const summary = { namespace, providerMode: health.providerMode, postA: a.id, postB: b.id,
    commentsB: (await call(`/posts/${b.id}/comments`, 'GET', undefined, token)).comments,
    jobs: jobs.jobs.filter(j => [a.id, b.id].includes(j.post_id)) }
  fs.mkdirSync(path.join(__dirname, '../reports'), { recursive: true })
  fs.writeFileSync(path.join(__dirname, '../reports/demo-run.json'), JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary, null, 2))
  console.log('No credentials printed. Fixtures use demo:ai-v1; node scripts/demo.js --clean only removes this namespace.')
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
