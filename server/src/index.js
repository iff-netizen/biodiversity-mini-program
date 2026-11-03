'use strict'
const path = require('node:path')
const { openDatabase } = require('./db')
const { environment } = require('./config')
const { createApp } = require('./app')
const { MockProvider } = require('./ai/providers/mock')
const { RealProvider } = require('./ai/providers/real')
const [major, minor, patch] = process.versions.node.split('.').map(Number)
if (major !== 24 || minor < 22 || (minor === 22 && patch < 1)) throw new Error('Use Node >=24.22.1 <25 for this local service')
const options = environment()
const db = openDatabase(process.env.DATABASE_PATH || path.join(__dirname, '../var/community.sqlite'))
const provider = options.provider === 'real' ? new RealProvider() : new MockProvider()
const app = createApp({ ...options, config: options.policy, db, provider, providerMode: provider.mode })
const timer = setInterval(() => app.worker.drain().catch(() => console.error('Worker failed; details withheld')), 1000)
app.server.listen(options.port, options.host, () => {
  console.log(`Community: http://${options.host}:${options.port} | ${provider.mode} | ${options.mode} | dev controls: ${options.devControls} | ${options.policy.version} | post probability: ${options.policy.postBaseProbability * 100}%`)
  if (provider.mode === 'real' && (!provider.key || !provider.model)) console.log('Real provider credentials incomplete; jobs will skip without mock fallback.')
})
let closing = false
async function close() {
  if (closing) return
  closing = true; clearInterval(timer)
  app.server.close(async () => {
    // Wait for bounded in-flight model work before closing its database.
    while (app.worker.busy) await new Promise(resolve => setTimeout(resolve, 50))
    db.close()
  })
}
process.on('SIGINT', close); process.on('SIGTERM', close)
