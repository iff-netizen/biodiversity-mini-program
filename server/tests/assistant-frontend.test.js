'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.resolve(__dirname, '../..')
const event = id => ({ currentTarget: { dataset: { id } } })

function fixture() {
  const disk = new Map([['observations', [{ id: 'local-only' }]]])
  const requests = [], tabs = [], opens = []
  let connected = 'A', listener, modal, sheet, count = 0, captured
  const wx = {
    getStorageSync: key => structuredClone(disk.get(key)),
    setStorageSync: (key, data) => disk.set(key, structuredClone(data)),
    removeStorageSync: key => disk.delete(key),
    getWindowInfo: () => ({ windowWidth: 375, windowHeight: 660, screenTop: 88, safeArea: { left: 0, right: 375, bottom: 778 } }),
    showModal: options => { modal = options },
    showActionSheet: options => { sheet = options },
    navigateTo: options => { opens.push(options.url); options.complete() },
    switchTab: options => tabs.push(options.url),
    showToast() {},
    createSelectorQuery: () => ({ select() { return this }, boundingClientRect(fn) { fn({ height: 400 }); return this }, exec() {} })
  }
  const community = {
    key: prefix => prefix + '-' + ++count,
    cachedIdentity: () => connected,
    onIdentityChange(fn) { listener = fn; return () => { listener = null } },
    async connect(identity) { connected = identity; listener?.(identity) }
  }
  const transport = {
    requestChat(input, identity) {
      const pending = Promise.withResolvers()
      const req = { input, identity, pending, cancelled: false }
      requests.push(req)
      return { promise: pending.promise, cancel: () => { req.cancelled = true } }
    }
  }
  const cache = new Map()
  function load(file) {
    const absolute = path.join(root, file)
    if (cache.has(absolute)) return cache.get(absolute).exports
    const module = { exports: {} }
    cache.set(absolute, module)
    const localRequire = createRequire(absolute)
    vm.runInNewContext(fs.readFileSync(absolute, 'utf8'), {
      module, wx, setTimeout, clearTimeout,
      Page: definition => { captured = definition },
      Component: definition => { captured = definition },
      require: name => {
        if (name.includes('services/community')) return community
        if (name.includes('services/assistant')) return transport
        return load(path.relative(root, localRequire.resolve(name)))
      }
    }, { filename: absolute })
    return module.exports
  }
  function instance(file) {
    cache.delete(path.join(root, file))
    load(file)
    const obj = { ...captured, ...captured.methods, data: structuredClone(captured.data) }
    obj.setData = (update, done) => { Object.assign(obj.data, structuredClone(update)); done?.() }
    return obj
  }
  return {
    page() { const value = instance('pages/assistant/assistant.js'); value.onLoad({ from: 'map' }); return value },
    component: () => instance('components/assistant-fab/assistant-fab.js'),
    storage: () => load('utils/assistant-storage.js'),
    connect: identity => community.connect(identity),
    requests, tabs, opens, disk,
    accept: () => modal.success({ confirm: true }),
    pick: index => sheet.success({ tapIndex: index })
  }
}

const tick = () => new Promise(setImmediate)
const ai = reply => ({ reply, actionIds: [], followUpIds: [], sourceType: 'ai' })

test('FAQ immediately writes an offline guide, approved navigation and draft survive page reopening', async () => {
  const x = fixture(), page = x.page()
  page.input({ detail: { value: '继续编辑的草稿' } })
  await page.sendFaq(event('record_observation'))
  await page.sendFaq(event('record_observation'))
  assert.equal(x.requests.length, 0)
  assert.equal(page.data.turns.length, 1)
  assert.match(page.data.turns[0].result.reply, /模拟/)
  assert.equal(page.data.turns[0].sourceLabel, '功能指南')
  assert.equal(page.data.faqOpen, false)
  page.navigate(event('open_identify'))
  page.navigate(event('constructor'))
  assert.deepEqual(x.tabs, ['/pages/identify/identify'])
  page.onHide()
  page.onUnload()
  const restored = x.page()
  assert.equal(restored.data.turns[0].content, '怎么记录一次自然观察？')
  assert.equal(restored.data.draft, '继续编辑的草稿')
  restored.onUnload()
})

test('chat cancellation, retry, scrolling, identity changes and clear ignore late results', async () => {
  const x = fixture(), page = x.page()
  const first = page.send('我今天有点累。')
  await page.send('重复点击')
  x.accept()
  await tick()
  assert.equal(x.requests.length, 1)
  page.cancelPending()
  assert.equal(x.requests[0].cancelled, true)
  x.requests[0].pending.resolve(ai('迟到的 A 回复'))
  await first
  assert.equal(page.data.turns[0].status, 'cancelled')

  const retry = page.retry(event(page.data.turns[0].id))
  assert.equal(x.requests.length, 2)
  assert.equal(page.data.turns.length, 1)
  page.atBottom = false
  x.requests[1].pending.resolve(ai('这次成功了'))
  await retry
  assert.equal(page.data.newReply, true)
  const follow = page.send('那你说了什么？')
  assert.equal(x.requests[2].input.history.length, 2)
  await x.connect('B')
  assert.equal(x.requests[2].cancelled, true)
  x.requests[2].pending.resolve(ai('身份切换后的迟到回复'))
  await follow
  assert.equal(page.data.turns.length, 0)

  await x.connect('C')
  assert.equal(page.data.turns.length, 0)
  await x.connect('A')
  assert.equal(page.data.turns[0].result.reply, '这次成功了')
  page.newChat()
  const newChat = page.send('聊个新话题吧。')
  assert.equal(x.requests[3].input.history.length, 0)
  const clear = page.clearHistory()
  x.accept()
  await clear
  assert.equal(x.requests[3].cancelled, true)
  x.requests[3].pending.resolve(ai('清空后的迟到回复'))
  await newChat
  assert.equal(page.data.turns.length, 0)
  assert.equal(x.disk.has('assistant.history.v1.A'), false)
  assert.deepEqual(x.disk.get('observations'), [{ id: 'local-only' }])
  page.onUnload()
})

test('visitor chooses an explicit developer identity and never transfers guest history', async () => {
  const x = fixture()
  await x.connect('')
  const page = x.page()
  await page.sendFaq(event('first_visit'))
  assert.equal(page.data.identity, 'guest')
  const send = page.send('陪我聊聊天')
  x.pick(1)
  await tick()
  assert.equal(page.data.identity, 'B')
  x.accept()
  await tick()
  assert.equal(x.requests[0].identity, 'B')
  assert.equal(x.requests[0].input.history.length, 0)
  assert.equal(x.storage().load('guest').sessions[0].turns.length, 1)
  x.requests[0].pending.resolve(ai('我在听。'))
  await send
  page.onUnload()
})

test('an uncertain network delivery reuses the same request while a known failure can start a fresh attempt', async () => {
  const x = fixture(), page = x.page()
  const send = page.send('陪我聊聊天')
  x.accept()
  await tick()
  const first = x.requests[0]
  first.pending.reject(Object.assign(new Error('连接中断'), { deliveryUncertain: true }))
  await send
  const turn = event(page.data.turns[0].id)
  const replay = page.retry(turn)
  assert.deepEqual(x.requests[1].input, first.input)
  x.requests[1].pending.reject(new Error('AI 服务现在较忙'))
  await replay
  const fresh = page.retry(turn)
  assert.notEqual(x.requests[2].input.requestId, first.input.requestId)
  x.requests[2].pending.resolve(ai('我在听。'))
  await fresh
  assert.equal(page.data.turns.length, 1)
  assert.equal(page.data.turns[0].status, 'success')
  page.onUnload()
})

test('history limits omit pending, mock and failed turns and enforce a seven-day local retention window', () => {
  const x = fixture(), store = x.storage()
  const now = Date.now()
  store.save('A', { id: 'old', draft: '', turns: [], updatedAt: now }, [], now - 8 * 86400000)
  assert.equal(store.load('A', now).sessions.length, 0)
  assert.equal(x.disk.has('assistant.history.v1.A'), false)
  const turns = Array.from({ length: 100 }, (_, i) => ({ id: String(i), content: '问', status: 'success', result: ai('答') }))
  turns[98].status = 'failed'
  turns[99].result.sourceType = 'mock'
  assert.equal(store.modelHistory(turns).length, 12)
  assert.equal(store.save('A', { id: 'fresh', draft: '', turns }, []).sessions[0].turns.length, 50)
  const pending = { id: 'pend', content: '等待', status: 'pending' }
  store.save('A', { id: 'pend', draft: '', turns: [pending] }, [])
  assert.equal(store.load('A').sessions[0].turns[0].status, 'cancelled')
})

test('floating ball clamps corrupt positions, uses viewport deltas and never opens on drag end', () => {
  const x = fixture()
  x.storage().savePosition({ left: Infinity, top: -200 })
  const component = x.component()
  component.lifetimes.attached.call(component)
  assert.ok(component.data.left > 250 && component.data.top > 400)
  const touch = (clientX, clientY) => ({ identifier: 1, clientX, clientY })
  component.touchStart({ touches: [touch(320, 545)] })
  component.touchMove({ touches: [touch(-50, -80)] })
  component.touchEnd({ changedTouches: [touch(-50, -80)] })
  component.tapBall()
  assert.equal(x.opens.length, 0)
  assert.equal(component.data.left, 10)
  assert.equal(component.data.top, 10)
  assert.deepEqual(x.storage().readPosition(), { left: 10, top: 10 })
  component.touchStart({ touches: [touch(20, 25)] })
  component.touchEnd({ changedTouches: [touch(22, 25)] })
  component.tapBall()
  assert.deepEqual(x.opens, ['/pages/assistant/assistant?from=map'])
  component.lifetimes.detached.call(component)
})
