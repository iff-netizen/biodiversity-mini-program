const test = require('node:test')
const assert = require('node:assert/strict')
const { setup, output } = require('./helpers')
const { MockProvider } = require('../src/ai/providers/mock')
const { RealProvider } = require('../src/ai/providers/real')
const { validateOutput } = require('../src/ai/validateOutput')
const { repetition } = require('../src/ai/quality')
const { buildContext } = require('../src/ai/promptBuilder')
const { retrieve } = require('../src/ai/memory')
const { chooseStyle } = require('../src/ai/policy')
function context(text, extra = {}) {
  return { currentPost: { content: text, speciesStatus: 'unknown', imageInput: false }, comments: [], communityMemories: [], verifiedFacts: [], recentBotComments: [], ...extra }
}

test('screenshot regressions: bird roll-call and reported civet receive distinct readable fixtures with no chopped quote', async () => {
  const mock = new MockProvider()
  const a = await mock.generateComment(context('早上鸟叫像在点名'))
  const b = await mock.generateComment(context('今天听老师说学校有小灵猫出没，好神奇我们学校居然有这种动物'))
  for (const result of [a, b]) {
    assert.equal(result.action, 'comment'); assert.ok(!result.text.includes('自然日记'))
    assert.ok(!result.text.includes('值得占个位置')); assert.ok(!result.text.includes('接住这句'))
  }
  assert.notEqual(a.text, b.text); assert.ok(a.text.includes('点名')); assert.ok(b.text.includes('待确认'))
  assert.equal(repetition(a.text, b.text), false)
  assert.throws(() => validateOutput(output('“早上鸟叫像在点名”，——自然日记多了一格，小小的发现也值得占个位置。'), context('早上鸟叫像在点名')), /canned_response/)
})

test('duplicate gate catches changed quotations followed by the same long ending', () => {
  const a = '“早上鸟叫像在点名”，这份小发现让今天的校园多了几分新鲜感。'
  const b = '“老师说校园可能有小灵猫”，这份小发现让今天的校园多了几分新鲜感。'
  assert.equal(repetition(a, b), true)
  assert.throws(() => validateOutput(output(b), context('另一条动态', { recentBotComments: [a] })), /near_duplicate/)
  assert.equal(repetition('不投喂，远远观察就好，今天的风很舒服。', '散步时碰见鸟叫，慢慢走就好。'), false)
})

test('unknown mock input skips instead of receiving a universal ending; no claim of general chat', async () => {
  const result = await new MockProvider().generateComment(context('今天食堂换了一套新的餐盘'))
  assert.equal(result.action, 'skip'); assert.equal(result.text, '')
})

test('same broad first-time/emotion tags and different named species do not create false related memory', t => {
  const x = setup(t)
  x.post('A', '第一次看到校园的麻雀，很开心')
  const b = x.post('B', '第一次听说校园出现小灵猫，很开心')
  assert.equal(retrieve(x.db, x.community.getPost(b.id), x.community.now()).length, 0)
  const c = x.post('C', '今天认真观察了一只白鹭，很开心')
  assert.equal(retrieve(x.db, x.community.getPost(c.id), x.community.now()).length, 0)
})

test('follow-up context retains the targeted human reply and AI parent after many other comments', async t => {
  const x = setup(t), post = x.post()
  await x.worker.drain(); const parent = x.community.comments('dev-A', post.id)[0]
  const human = x.comment('B', post.id, '哈哈今天的风确实舒服', { replyToCommentId: parent.id })
  for (let i = 0; i < 20; i++) x.comment('C', post.id, '另一个细节 ' + i)
  const job = x.db.prepare("SELECT * FROM ai_jobs WHERE post_id=? AND kind='followup'").get(post.id)
  const ctx = buildContext(x.db, x.community.getPost(post.id), job, x.community.now(), () => 0)
  assert.ok(ctx.comments.some(c => c.id === human.id)); assert.ok(ctx.comments.some(c => c.id === parent.id)); assert.ok(ctx.comments.length <= 8)
  assert.equal(ctx.replyToCommentId, human.id)
})

test('plain bird sharing is not forced into science; serious animal situations use appropriate style', () => {
  assert.notEqual(chooseStyle('早上听到鸟叫很开心', false, true, 0.99), 'science')
  assert.equal(chooseStyle('小动物受伤了，很担心', true, true, 0.99), 'warm')
  assert.equal(chooseStyle('它往后退，我想追上去拍', false, true, 0.5), 'science')
})

test('approved short science paraphrases pass, added unsupported claims and asserted identification fail', () => {
  const fact = require('../data/verified-facts.json')[0], ctx = context('想喂它', { verifiedFacts: [fact] })
  const valid = output(fact.approvedTexts[0], { style: 'science', usedFactIds: [fact.id] })
  assert.equal(validateOutput(valid, ctx).text, fact.approvedTexts[0])
  assert.throws(() => validateOutput({ ...valid, text: valid.text + '它一定无毒。' }, ctx), /unverified_science/)
  assert.throws(() => validateOutput(output('这肯定是小灵猫。'), context('感觉是小灵猫')), /unverified_science/)
  assert.throws(() => validateOutput(output('今天开心🌿🐾🌱'), context('今天开心')), /too_many_emoji/)
})

test('retry receives a trusted repair hint and current prompt version', async t => {
  let calls = 0, last
  const provider = { generateComment: async ctx => { calls++; last = ctx; return calls === 1 ? output('自然日记多了一格') : output('今天树下的风，确实适合慢慢走。') } }
  const x = setup(t, { provider }), p = x.post()
  await x.worker.drain(); x.advance(3000); await x.worker.drain()
  assert.equal(calls, 2); assert.ok(last.repairHint.includes('不要')); assert.equal(last.promptVersion, require('../src/ai/versions').promptVersion)
  assert.equal(x.db.prepare('SELECT prompt_version FROM ai_jobs WHERE post_id=?').get(p.id).prompt_version, require('../src/ai/versions').promptVersion)
  assert.equal(x.community.comments('dev-A', p.id).length, 1)
})

test('DeepSeek adapter uses documented token/thinking parameters and actual personality prompt', async () => {
  let payload
  const provider = new RealProvider({ AI_VENDOR: 'deepseek', AI_MODEL: 'deepseek-flash', AI_API_KEY: 'test-placeholder' }, async (url, init) => {
    assert.equal(url, 'https://api.deepseek.com/chat/completions'); payload = JSON.parse(init.body)
    return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output('早晨的鸟叫，像一个特别的闹钟。')) } }] }) }
  })
  await provider.generateComment(context('早晨鸟叫'))
  assert.equal(payload.max_tokens, 800); assert.equal(Object.hasOwn(payload, 'max_completion_tokens'), false)
  assert.equal(payload.thinking.type, 'disabled'); assert.equal(payload.response_format.type, 'json_object')
  assert.ok(payload.messages[0].content.includes(require('../src/ai/versions').promptVersion)); assert.ok(payload.messages[0].content.includes('不把帖子开头截成'))
})

for (const [choice, category] of [
  [{ finish_reason: 'stop', message: { content: '   ' } }, 'provider_empty'],
  [{ finish_reason: 'length', message: { content: '{}' } }, 'provider_truncated'],
  [{ finish_reason: 'stop', message: { refusal: 'refused', content: '' } }, 'provider_refusal']
]) test('real response boundary ' + category, async () => {
  const provider = new RealProvider({ AI_MODEL: 'test-model', AI_API_KEY: 'test-placeholder' }, async () => ({ ok: true, json: async () => ({ choices: [choice] }) }))
  await assert.rejects(provider.generateComment(context('测试')), new RegExp(category))
})

test('status makes missing real model configuration explicit without exposing a key', t => {
  const x = setup(t)
  assert.equal(x.community.posts('dev-A').aiStatus.code, 'mock_only')
  const provider = new RealProvider({ AI_VENDOR: 'deepseek' })
  assert.equal(provider.status().code, 'missing_credentials'); assert.ok(!JSON.stringify(provider.status()).includes('AI_API_KEY'))
})

test('legacy quality migration withdraws only defective old mock AI comments, retaining human and valid AI data', async t => {
  const { applyQualityMigration } = require('../src/db')
  const x = setup(t), p = x.post()
  await x.worker.drain()
  const bot = x.db.prepare("SELECT * FROM comments WHERE post_id=? AND author_type='ai'").get(p.id)
  x.db.prepare("UPDATE ai_jobs SET provider_model='deterministic-fixtures-v1' WHERE post_id=?").run(p.id)
  x.db.prepare('UPDATE comments SET content=? WHERE id=?').run('“原文”——自然日记多了一格，小小的发现也值得占个位置。', bot.id)
  const human = x.comment('B', p.id, '用户也可以讨论“自然日记多了一格”这句话')
  const q = x.post('C', '发现蝴蝶在花上停留'); await x.worker.drain()
  x.db.prepare('DELETE FROM schema_migrations WHERE version=3').run(); applyQualityMigration(x.db); applyQualityMigration(x.db)
  assert.equal(x.db.prepare('SELECT status FROM comments WHERE id=?').get(bot.id).status, 'quality_withdrawn')
  assert.equal(x.db.prepare('SELECT status FROM comments WHERE id=?').get(human.id).status, 'active')
  assert.ok(x.community.comments('dev-A', q.id).some(c => c.authorType === 'ai'))
  assert.equal(x.community.getPost(p.id).content, p.content)
})

test('tone acceptance cannot pass with mock results, missing ratings, validation errors or a critical issue', () => {
  const { reviewSummary } = require('../src/ai/toneReview')
  const row = () => ({ validation: 'pass', validatedOutput: { action: 'comment' }, ratings: { relevance: 4, naturalness: 4, liveliness: 4, restraint: 4, reliability: 4 }, criticalIssue: false })
  const report = { mode: 'real', rows: Array.from({ length: 30 }, row) }
  assert.equal(reviewSummary(report).passed, true)
  assert.equal(reviewSummary({ ...report, mode: 'mock' }).passed, false)
  report.rows[0].repairHistory = [{ validation: 'invalid_schema', criticalIssue: true }]; assert.equal(reviewSummary(report).status, 'critical_failure')
  delete report.rows[0].repairHistory
  report.rows[0].criticalIssue = true; assert.equal(reviewSummary(report).status, 'critical_failure')
  report.rows[0].criticalIssue = false; report.rows[0].ratings.naturalness = null; assert.equal(reviewSummary(report).status, 'incomplete_review')
  report.rows[0] = row(); report.rows.push({ validation: 'forged_source', criticalIssue: false })
  assert.equal(reviewSummary(report).status, 'output_validation_failure')
})

test('chasing safety fixture and an unknown animal do not produce playful or fabricated knowledge', async () => {
  const mock = new MockProvider(), facts = require('../data/verified-facts.json')
  const c = context('小动物往后退，我想追上去拍清楚', { verifiedFacts: facts })
  const result = await mock.generateComment(c)
  assert.equal(result.style, 'science'); assert.ok(result.text.includes('别追'))
  validateOutput(result, c)
  const unknown = await mock.generateComment(context('感觉学校出现了小灵猫'))
  assert.ok(unknown.text.includes('不能确认')); assert.equal(unknown.usedFactIds.length, 0)
})

test('memory excerpts keep whole clauses and final permission check rejects an expired memory', t => {
  const { summarizeAnecdote, sourceValid } = require('../src/ai/memory')
  assert.equal(summarizeAnecdote('今天听到鸟叫。' + '长'.repeat(150)), '今天听到鸟叫。')
  assert.equal(summarizeAnecdote('长'.repeat(150)), '')
  const x = setup(t), p = x.post('A', '早晨鸟叫像点名')
  const source = 'p:' + p.id + ':v1'
  assert.equal(sourceValid(x.db, source, x.community.now()), true)
  x.advance(15 * 86400000)
  assert.ok(!sourceValid(x.db, source, x.community.now()))
})

test('insufficient balance does not retry or keep making paid requests; live UI status reports it', async t => {
  let calls = 0
  const provider = new RealProvider({ AI_VENDOR: 'deepseek', AI_MODEL: 'deepseek-flash', AI_API_KEY: 'test-placeholder' }, async () => { calls++; return { status: 402, ok: false } })
  const x = setup(t, { provider }), p = x.post()
  await x.worker.drain()
  assert.equal(calls, 1); assert.equal(x.db.prepare('SELECT attempts FROM ai_jobs WHERE post_id=?').get(p.id).attempts, 1)
  assert.equal(x.community.posts('dev-A').aiStatus.code, 'insufficient_balance')
  x.post('B', '今天第一次看见蜜蜂'); await x.worker.drain(); assert.equal(calls, 1)
  assert.equal(x.db.prepare("SELECT count(*) n FROM comments WHERE author_type='ai'").get().n, 0)
})

test('consensus and coordinate gates distinguish harmless mentions from disclosure and group claims', () => {
  const c = context('鸟叫像在点名')
  assert.doesNotThrow(() => validateOutput(output('它念的是哪几位同学的名字呢？'), c))
  assert.doesNotThrow(() => validateOutput(output('具体点位先不公开啦，观察不需要追着坐标走。'), c))
  assert.throws(() => validateOutput(output('坐标：22.12345，113.12345'), c), /unsafe_output/)
  assert.throws(() => validateOutput(output('大家最近都在聊早晨的鸟叫。'), c), /unproven_consensus/)
})

test('revocation withdraws AI exposed to a source even if model omitted its usedMemoryIds', async t => {
  const x = setup(t, { provider: { mode: 'real', generateComment: async () => output('清晨的声音还挺热闹，这个比喻一下就有画面了。') } })
  const a = x.post('A', '早上鸟叫像点名')
  x.db.prepare("UPDATE ai_jobs SET status='skipped' WHERE post_id=?").run(a.id)
  const b = x.post('B', '早晨鸟叫又像在广播'); await x.worker.drain()
  assert.equal(x.community.comments('dev-B', b.id).length, 1)
  x.community.patchPost('dev-A', a.id, { memoryAllowed: false })
  assert.equal(x.community.comments('dev-B', b.id).length, 0)
})

test('follow-up inherits the parent AI memory sources even without a fresh related-memory lookup', async t => {
  const x = setup(t, { provider: { mode: 'real', generateComment: async c => c.replyToCommentId
    ? output('这个早间节目还挺准时，听着都精神起来了。')
    : output('有人提过鸟叫像点名，这回又听到了。', { style: 'community', usedMemoryIds: [c.communityMemories[0].id] }) } })
  const a = x.post('A', '早上鸟叫像点名'); x.db.prepare("UPDATE ai_jobs SET status='skipped' WHERE post_id=?").run(a.id)
  const b = x.post('B', '早晨鸟叫像晨间广播'); await x.worker.drain()
  const initial = x.community.comments('dev-B', b.id)[0]
  x.comment('B', b.id, '哈哈还挺准时的', { replyToCommentId: initial.id }); await x.worker.drain()
  assert.equal(x.community.comments('dev-B', b.id).filter(c => c.authorType === 'ai').length, 2)
  x.community.patchPost('dev-A', a.id, { memoryAllowed: false })
  assert.equal(x.community.comments('dev-B', b.id).filter(c => c.authorType === 'ai').length, 0)
})
