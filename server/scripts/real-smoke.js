'use strict'
// Three bounded events (at most six calls) through the service/worker, using an
// isolated in-memory database and synthetic A/B identities. No live posts touched.
const fs = require('node:fs'), path = require('node:path')
const { openDatabase } = require('../src/db')
const { createApp } = require('../src/app')
const { RealProvider } = require('../src/ai/providers/real')
const { promptVersion } = require('../src/ai/versions')
async function main() {
  const provider = new RealProvider()
  const observations = [], generate = provider.generateComment.bind(provider)
  provider.generateComment = async (context, options) => { const result = await generate(context, options); observations.push({ context, output: result.output }); return result }
  if (process.env.AI_PROVIDER !== 'real' || !provider.status().configured) throw new Error('missing_credentials')
  const db = openDatabase(':memory:')
  const app = createApp({ db, provider, rng: () => 0, config: { delaySecondsMin: 0, delaySecondsMax: 0, authorInitialCooldownMinutes: 0, followupCooldownSeconds: 0 } })
  async function settle() {
    for (let i = 0; i < 2; i++) {
      await app.worker.drain()
      if (!db.prepare("SELECT id FROM ai_jobs WHERE status='pending'").get()) return
      await new Promise(resolve => setTimeout(resolve, 2200))
    }
  }
  try {
    app.community.session('A'); app.community.session('B')
    const a = app.community.createPost('dev-A', { content: '早上鸟叫像在点名，比闹钟还准。', requestKey: 'real-smoke-a' })
    await settle()
    const b = app.community.createPost('dev-B', { content: '今天早晨鸟叫像校园晨间广播。广场上是不是也有人聊过这种声音？', requestKey: 'real-smoke-b' })
    app.community.rng = () => 0.99; await settle()
    const initial = app.community.comments('dev-B', b.id).find(c => c.authorType === 'ai')
    if (!initial) throw new Error('initial_comment_missing')
    const memoryContext = observations.filter(o => o.context.currentPost.id === b.id).at(-1)
    const memoryAvailable = memoryContext?.context.communityMemories.some(m => m.sourceIds.includes(`p:${a.id}:v1`))
    if (!memoryAvailable) throw new Error('memory_context_missing')
    const declaredReference = JSON.parse(memoryContext.output).usedMemoryIds.length > 0
    app.community.rng = () => 0
    app.community.addComment('dev-B', b.id, { content: '这个早间广播还真停不下来，哈哈', replyToCommentId: initial.id, requestKey: 'real-smoke-reply' })
    await settle()
    const ai = app.community.comments('dev-B', b.id).filter(c => c.authorType === 'ai')
    if (ai.length !== 2) throw new Error('followup_missing')
    const calls = db.prepare('SELECT count(*) n FROM provider_calls').get().n
    const report = { mode: 'real', model: provider.model, promptVersion, database: 'isolated_in_memory', userDataTouched: false, calls,
      checks: { initialPublished: true, crossUserMemoryInContext: !!memoryAvailable, modelDeclaredMemoryReference: declaredReference, oneFollowupPublished: true },
      sourcePost: a.content, targetPost: b.content, comments: ai.map(c => c.content), reviewStatus: 'awaiting_human_tone_review', note: '检索与模型自主引用分别记录，不把进入上下文说成已被引用。' }
    fs.mkdirSync(path.join(__dirname, '../reports'), { recursive: true })
    fs.writeFileSync(path.join(__dirname, '../reports/real-smoke.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2))
  } finally { db.close() }
}
main().catch(error => { console.error(/^[a-z_0-9]+$/.test(error.message) ? error.message : 'real_smoke_failed'); process.exitCode = 1 })
