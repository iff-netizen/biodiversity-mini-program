'use strict'
const { RealProvider } = require('../src/ai/providers/real')
const { buildContext } = require('../src/ai/promptBuilder')
const { validateOutput } = require('../src/ai/validateOutput')
const { Community } = require('../src/community')
const { openDatabase } = require('../src/db')
async function main() {
  const provider = new RealProvider()
  const result = { node: process.version, selectedMode: process.env.AI_PROVIDER || 'mock', ...provider.status(), apiProbe: 'not_run', boundary: '配置状态不等于真实模型调用成功' }
  console.log(JSON.stringify(result, null, 2))
  if (!process.argv.includes('--probe')) return
  if (process.env.AI_PROVIDER !== 'real' || !provider.status().configured) throw new Error('请先在本机 .env 配置 AI_PROVIDER=real、AI_VENDOR、AI_MODEL、AI_API_KEY；不会切换为 Mock。')
  const db = openDatabase(':memory:')
  try {
    const service = new Community({ db, config: { enabled: false } }); service.session('A')
    const post = service.createPost('dev-A', { content: '今天什么都没拍到，但风很舒服。', requestKey: 'synthetic-probe' })
    const job = db.prepare('SELECT * FROM ai_jobs WHERE post_id=?').get(post.id)
    const context = buildContext(db, service.getPost(post.id), job, service.now(), () => 0.5)
    const raw = await provider.generateComment(context, { signal: AbortSignal.timeout(15000) })
    const output = validateOutput(raw.output, context)
    console.log(JSON.stringify({ apiProbe: 'passed', mode: 'real', action: output.action, text: output.text, promptVersion: context.promptVersion, note: '仅一条合成输入；未通过完整语气验收' }, null, 2))
  } finally { db.close() }
}
main().catch(error => { console.error(/^provider_|^invalid_|^near_duplicate|^unverified_|^unsafe_|^missing_credentials/.test(error.message) ? error.message : '模型检查未通过，请核对配置、网络、余额或开发诊断；未输出凭据。'); process.exitCode = 1 })
