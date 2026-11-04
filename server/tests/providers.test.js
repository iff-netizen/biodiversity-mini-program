const test = require('node:test')
const assert = require('node:assert/strict')
const { setup, output } = require('./helpers')
const { validateOutput } = require('../src/ai/validateOutput')
const { RealProvider } = require('../src/ai/providers/real')
const empty = () => ({ communityMemories: [], verifiedFacts: [], recentBotComments: [] })

test('output schema rejects illegal JSON, extra fields, oversize, forged sources and unsafe text', () => {
  const context = empty()
  const cases = [
    ['not JSON', /invalid_json/], [output('正常文本', { authorType: 'ai' }), /invalid_schema/],
    [output('长'.repeat(121)), /invalid_length/], [output('普通文本', { usedMemoryIds: ['invented'] }), /forged_source/],
    [output('普通文本', { usedFactIds: ['invented'] }), /forged_source/],
    [output('电话13812345678'), /unsafe_output/], [output('我刚刚亲眼看到啦'), /unsafe_output/],
    [output('建议投喂它'), /unsafe_output/], [output('大家最近都在聊'), /unproven_consensus/],
    [output('有人提过这里的故事'), /unproven_memory/], [output('它属于猫科'), /unverified_science/],
    [output('这个物种很神奇', { style: 'science' }), /unverified_science/],
    [output('重复句子', { action: 'skip' }), /invalid_skip/]
  ]
  for (const [value, expected] of cases) assert.throws(() => validateOutput(value, context), expected)
  assert.throws(() => validateOutput(output('今天收藏的是风'), { ...context, recentBotComments: ['今天收藏的是风。'] }), /near_duplicate/)
  const f = { id: 'fact', text: '保持距离，远远观察。' }
  assert.equal(validateOutput(output(f.text, { style: 'science', usedFactIds: ['fact'] }), { ...context, verifiedFacts: [f] }).text, f.text)
  assert.throws(() => validateOutput(output(f.text + '它一定无毒。', { style: 'science', usedFactIds: ['fact'] }), { ...context, verifiedFacts: [f] }), /unverified_science/)
})

for (const category of ['provider_429', 'provider_network', 'provider_timeout', 'invalid_json', 'invalid_length', 'forged_source', 'near_duplicate']) {
  test(`${category} uses bounded retry, never posts a stack trace or mock fallback`, async t => {
    let calls = 0
    const provider = { mode: 'real', generateComment: async () => {
      calls++
      if (category === 'provider_timeout') return new Promise(() => {})
      if (category === 'invalid_json') return '{'
      if (category === 'invalid_length') return output('长'.repeat(121))
      if (category === 'forged_source') return output('没有凭据的回忆', { usedMemoryIds: ['made-up'] })
      if (category === 'near_duplicate') return output('今天收藏的是风')
      throw new Error(category)
    } }
    const x = setup(t, { provider, config: { providerTimeoutMs: 10 } })
    const p = x.post()
    if (category === 'near_duplicate') x.db.prepare("INSERT INTO comments (id,post_id,author_id,author_type,content,created_at,request_key) VALUES ('previous',?,'bot-yellow','ai','今天收藏的是风',?,'prior')").run(p.id, x.community.now())
    await x.worker.drain(); x.advance(10000); await x.worker.drain(); x.advance(10000); await x.worker.drain()
    assert.equal(calls, 2)
    const job = x.db.prepare('SELECT * FROM ai_jobs WHERE post_id=?').get(p.id)
    assert.equal(job.status, 'skipped'); assert.equal(job.error_category, category)
    assert.equal(x.db.prepare('SELECT count(*) n FROM comments WHERE job_id IS NOT NULL').get().n, 0)
    x.comment('B', p.id, '人工评论仍能保存')
    assert.ok(x.community.comments('dev-B', p.id).some(c => c.content === '人工评论仍能保存'))
  })
}

test('missing real credentials skips once with no mock fallback', async t => {
  const provider = new RealProvider({})
  const x = setup(t, { provider }), p = x.post()
  await x.worker.drain()
  const job = x.db.prepare('SELECT * FROM ai_jobs WHERE post_id=?').get(p.id)
  assert.equal(job.attempts, 1); assert.equal(job.status, 'skipped'); assert.equal(job.error_category, 'missing_credentials')
})

test('real adapter uses system/data separation, JSON protocol, abort signal and usage', async () => {
  let captured
  const provider = new RealProvider({ AI_API_KEY: 'test-placeholder', AI_MODEL: 'configured-test-model' }, async (url, args) => {
    captured = { url, ...args }
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(output('今天的自然日记多了一页。')) } }], usage: { total_tokens: 100 } }) }
  })
  const context = { ...empty(), currentPost: { content: '这里是用户数据' } }, controller = new AbortController()
  const response = await provider.generateComment(context, { signal: controller.signal })
  const body = JSON.parse(captured.body)
  assert.ok(!body.messages[0].content.includes('这里是用户数据'))
  assert.ok(body.messages[1].content.includes('untrusted_community_data'))
  assert.equal(body.response_format.type, 'json_object'); assert.equal(captured.signal, controller.signal)
  assert.equal(response.usage.total_tokens, 100); assert.equal(body.model, 'configured-test-model')
})
