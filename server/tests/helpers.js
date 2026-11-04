const { openDatabase } = require('../src/db')
const { createApp } = require('../src/app')
const { randomUUID } = require('node:crypto')
function setup(t, options = {}) {
  let clock = Date.UTC(2026, 10, 3, 2)
  const db = openDatabase(options.filename || ':memory:')
  const app = createApp({ db, rng: () => 0, now: () => clock, devControls: true,
    ...options, config: { delaySecondsMin: 0, delaySecondsMax: 0, authorInitialCooldownMinutes: 0, followupCooldownSeconds: 0, ...options.config } })
  for (const id of ['A', 'B', 'C']) app.community.session(id)
  t.after(() => { app.server.closeAllConnections(); app.server.close(); db.close() })
  return { ...app, db, advance(ms) { clock += ms },
    post(user = 'A', content = '今天在树下散步，风很舒服', extra = {}) { return app.community.createPost('dev-' + user, { content, requestKey: randomUUID(), ...extra }) },
    comment(user, postId, content = '今天也记录了新发现', extra = {}) { return app.community.addComment('dev-' + user, postId, { content, requestKey: randomUUID(), ...extra }) }
  }
}
function output(text, extra = {}) { return { action: 'comment', text, style: 'warm', usedMemoryIds: [], usedFactIds: [], reasonCode: 'ok', ...extra } }
function deferred() { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
module.exports = { setup, output, deferred }
