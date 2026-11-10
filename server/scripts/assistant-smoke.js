'use strict'

// Uses a temporary SQLite database and synthetic messages only.
const { once } = require('node:events')
const { randomUUID } = require('node:crypto')
const { openDatabase } = require('../src/db')
const { createApp } = require('../src/app')
const { RealProvider } = require('../src/ai/providers/real')
const { knowledgeVersion } = require('../../shared/assistant/catalog')

const cases = [
  ['record', '我想记录一种看到的小动物，怎么弄？', 'guide'],
  ['correct', '如果识别错了呢？', 'guide'],
  ['demo', '这个识别结果是真的吗？', 'guide'],
  ['collection', '帮我打开图鉴。', 'guide'],
  ['delete', '可以自动替我删除所有观察吗？', 'guide'],
  ['wildlife', '为什么不要投喂野生动物？', 'ai'],
  ['tired', '我今天有点累。', 'ai'],
  ['live', '帮我查询附近现在全部的野生动物。', 'guide'],
  ['complex', '我想记录一只小动物，保存观察后再分享到广场；如果定位没授权，图鉴会不会解锁？', 'ai'],
  ['chat-start', '今天我在图书馆借了一本科幻小说，打算周六读三章。', 'ai'],
  ['chat-follow-up', '那我准备在什么时候读几章？', 'ai']
]
const checks = {
  record: answer => /模拟/.test(answer.reply) && /保存观察记录/.test(answer.reply),
  correct: answer => /识别不准确/.test(answer.reply),
  demo: answer => /模拟/.test(answer.reply),
  collection: answer => answer.actionIds.includes('open_collection'),
  delete: answer => answer.actionIds.every(id => ['open_map', 'open_profile'].includes(id)),
  live: answer => /无法查询/.test(answer.reply),
  complex: answer => ['模拟', '定位', '公开发布', '解锁'].every(term => answer.reply.includes(term)),
  'chat-follow-up': answer => /周六|星期六|礼拜六/.test(answer.reply) && /三章|3\s*章/.test(answer.reply)
}

async function main() {
  const provider = new RealProvider()
  if (process.env.AI_PROVIDER !== 'real' || provider.vendor !== 'deepseek' ||
      new URL(provider.baseUrl).origin !== 'https://api.deepseek.com' || !provider.status().configured) {
    console.log(JSON.stringify({ error: 'official_deepseek_not_configured' }))
    process.exitCode = 1
    return
  }
  const db = openDatabase(':memory:')
  const { server, community } = createApp({ db, provider, assistantLog: event => console.log(JSON.stringify({ providerCall: event })) })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const token = community.session('A').token
  const url = 'http://127.0.0.1:' + server.address().port + '/assistant/chat'
  let session, history = []
  try {
    const selected = process.argv.includes('--multi-turn-only') ? cases.filter(([id]) => id.startsWith('chat-')) : cases
    for (const [id, message, expected] of selected) {
      if (!['correct', 'demo', 'chat-follow-up'].includes(id)) { session = randomUUID(); history = [] }
      const started = Date.now()
      const response = await fetch(url, {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientSessionId: session, requestId: randomUUID(), message, history, context: { pageId: 'map' }, knowledgeVersion })
      })
      const data = await response.json()
      const pass = response.ok && data.sourceType === expected && (checks[id]?.(data) ?? true)
      console.log(JSON.stringify({
        time: new Date().toISOString(), id, message, expected, source: data.sourceType, reply: data.reply,
        actions: data.actionIds, pass, elapsedMs: Date.now() - started, error: data.error?.code
      }))
      if (!pass) process.exitCode = 1
      if (response.ok) history.push({ role: 'user', content: message }, { role: 'assistant', content: data.reply })
      if (['missing_credentials', 'provider_insufficient_balance', 'provider_http_401', 'provider_http_403', 'provider_network'].includes(data.error?.code)) break
    }
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    db.close()
  }
}

main().catch(() => { console.log(JSON.stringify({ error: 'smoke_runner_failed' })); process.exitCode = 1 })
