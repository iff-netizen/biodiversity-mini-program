'use strict'
// Explicit real-provider evaluation only. Outputs stay in ignored reports/.
const { openDatabase } = require('../src/db')
const { Community } = require('../src/community')
const { RealProvider } = require('../src/ai/providers/real')
const { buildContext } = require('../src/ai/promptBuilder')
const { validateOutput } = require('../src/ai/validateOutput')
const { promptVersion } = require('../src/ai/versions')
const { normalText, unsafeInput } = require('../src/ai/safety')
const { repairHint } = require('../src/ai/repairHints')
const fs = require('node:fs'), path = require('node:path')
async function main() {
  const provider = new RealProvider()
  if (!provider.key || !provider.model) throw new Error('Set AI_API_KEY and AI_MODEL in local .env; no model evaluation was run.')
  if (process.argv.includes('--repair-failed')) return repairFailed(provider)
  const db = openDatabase(':memory:')
  const service = new Community({ db, rng: () => 0.99, config: { enabled: false } })
  service.session('A'); service.session('B')
  const report = { model: provider.model, vendor: provider.vendor, promptVersion, createdAt: new Date().toISOString(), mode: 'real', reviewStatus: 'awaiting_human_ratings', providerCalls: 0, rows: [] }
  try {
    const fixtures = require('../fixtures/tone-posts.json')
    for (let i = 0; i < fixtures.length; i++) {
      const fixture = fixtures[i], row = { ...fixture, index: i + 1, ratings: { relevance: null, naturalness: null, liveliness: null, restraint: null, reliability: null }, criticalIssue: null }
      try {
        if (normalText(fixture.content).length < 2 || unsafeInput(fixture.content)) { const error = new Error('blocked_before_model'); error.code = 'blocked_input'; throw error }
        const post = service.createPost('dev-' + (i % 2 ? 'B' : 'A'), { content: fixture.content, requestKey: 'tone-' + i })
        const job = db.prepare('SELECT * FROM ai_jobs WHERE post_id=?').get(post.id)
        const context = buildContext(db, service.getPost(post.id), job, service.now(), () => i / fixtures.length)
        row.input = context
        report.providerCalls++
        const raw = await provider.generateComment(context, { signal: AbortSignal.timeout(15000) })
        row.rawOutput = raw.output; row.usage = raw.usage
        try {
          row.validatedOutput = validateOutput(raw.output, context); row.validation = 'pass'
          // Keep actual accepted outputs in the next case's recent history.
          // Never write these synthetic AI responses to community memory.
          if (row.validatedOutput.action === 'comment') db.prepare("INSERT INTO comments (id,post_id,author_id,author_type,content,created_at,request_key) VALUES (?,?,'bot-yellow','ai',?,?,?)")
            .run('tone-output-' + i, post.id, row.validatedOutput.text, service.now(), 'tone-output-' + i)
        }
        catch (error) { row.validation = error.message }
      } catch (error) { row.validation = /private_content|blocked_input/.test(error.code || '') ? 'blocked_before_model' : 'provider_or_input_error'; row.note = 'No mock substituted' }
      report.rows.push(row)
      console.log(`Tone case ${i + 1}/${fixtures.length}: ${row.validation}`)
      fs.mkdirSync(path.join(__dirname, '../reports'), { recursive: true })
      fs.writeFileSync(path.join(__dirname, '../reports/tone-real.json'), JSON.stringify(report, null, 2))
    }
  } finally { db.close() }
}
async function repairFailed(provider) {
  const filename = path.join(__dirname, '../reports/tone-real.json')
  const report = JSON.parse(fs.readFileSync(filename, 'utf8'))
  if (report.mode !== 'real' || report.model !== provider.model || report.vendor !== provider.vendor) throw new Error('Report/model mismatch; no calls made')
  report.latestPromptVersion = promptVersion
  for (const row of report.rows) {
    if (['pass', 'blocked_before_model'].includes(row.validation) || !row.rawOutput || !row.input) continue
    try {
      row.validatedOutput = validateOutput(row.rawOutput, row.input)
      row.revalidation = { previousValidation: row.validation, validatorVersion: 'output-gates-2', at: new Date().toISOString() }
      row.validation = 'pass'; console.log(`Tone case ${row.index}: original output passes corrected validator (no API call)`)
    } catch {
      if ((row.repairHistory || []).length >= 1) continue
      row.repairHistory = [...(row.repairHistory || []), { promptVersion: row.input.promptVersion, rawOutput: row.rawOutput, validation: row.validation, criticalIssue: row.criticalIssue, ratings: row.ratings }]
      const context = { ...row.input, promptVersion, repairHint: repairHint(row.validation) }
      row.input = context; row.ratings = { relevance: null, naturalness: null, liveliness: null, restraint: null, reliability: null }; row.criticalIssue = null
      try {
        report.providerCalls++
        const raw = await provider.generateComment(context, { signal: AbortSignal.timeout(15000) })
        row.rawOutput = raw.output; row.usage = raw.usage
        row.validatedOutput = validateOutput(raw.output, context); row.validation = 'pass'
      } catch (error) { delete row.validatedOutput; row.validation = /^provider_|^invalid_|^unverified_|^unproven_|^unsafe_|^near_duplicate/.test(error.message) ? error.message : 'provider_or_validation_error' }
      console.log(`Tone case ${row.index}: one bounded repair -> ${row.validation}`)
    }
    report.promptVersions = [...new Set(report.rows.map(r => r.input?.promptVersion).filter(Boolean))]
    fs.writeFileSync(filename, JSON.stringify(report, null, 2))
    if (provider.status().code === 'insufficient_balance') { console.log('余额不足，已停止模型请求。'); break }
  }
  report.reviewStatus = 'awaiting_human_ratings'
  fs.writeFileSync(filename, JSON.stringify(report, null, 2))
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
