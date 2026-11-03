const test = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')
const path = require('node:path')
const { deferred } = require('./helpers')
const root = path.join(__dirname, '../..')
function page(name, storage = {}, serviceOverrides = {}) {
  let definition, modal, timer, cleared = 0, requests = [], navigated
  const service = { config: { POLL_INTERVAL_MS: 5000 }, identity: () => 'A', draftKey: () => 'draft.A', key: p => p + '-stable',
    request: async (...args) => { requests.push(args); return { posts: [], nextCursor: null, providerMode: 'mock' } },
    hasShares: () => false, ...serviceOverrides }
  const wx = {
    getStorageSync: key => storage[key], setStorageSync: (key, value) => { storage[key] = value }, removeStorageSync: key => { delete storage[key] },
    showToast() {}, showModal: options => { modal = options }, showActionSheet() {}, stopPullDownRefresh() {},
    setNavigationBarTitle() {}, navigateBack() { navigated = true }, switchTab() {}, navigateTo(options) { navigated = options.url }
  }
  const context = { wx, console, Page: value => { definition = value }, setInterval: fn => { timer = fn; return 1 }, clearInterval: () => { cleared++; timer = null }, setTimeout: fn => fn(),
    require: location => location.includes('services/community') ? service : location.includes('config/config') ? { TENCENT_MAP_KEY: 'placeholder' } : require(path.resolve(root, 'pages', name, location)) }
  vm.runInNewContext(fs.readFileSync(path.join(root, `pages/${name}/${name}.js`), 'utf8'), context)
  definition.data = structuredClone(definition.data)
  definition.setData = patch => Object.assign(definition.data, patch)
  return { instance: definition, wx, service, storage, requests, modal: () => modal, timer: () => timer, cleared: () => cleared, navigated: () => navigated }
}

test('discover never uploads historical observations; polling stops on hide and unload', async () => {
  const observations = [{ id: 123, speciesName: '豹猫', latitude: 22.123456, imagePath: 'wxfile://temp' }]
  const x = page('discover', { observations, interactions: { 123: { liked: true, likeCount: 2, comments: [{ id: 1, content: '旧评论' }] } } })
  x.instance.onShow(); await new Promise(setImmediate)
  assert.equal(x.instance.data.localPosts[0].liked, true)
  assert.equal(x.requests.some(([, method]) => method === 'POST'), false)
  assert.equal(x.storage.observations, observations)
  assert.ok(x.timer()); x.instance.onHide(); assert.equal(x.timer(), null)
  x.instance.onShow(); assert.ok(x.timer()); x.instance.onUnload(); assert.equal(x.timer(), null)
})

test('text post failures retain draft and request key; success does not change observation counts', async () => {
  let fail = true, attempts = []
  const x = page('discover', { observations: [{ id: 1, speciesName: '豹猫' }] }, { request: async (route, method, body) => {
    if (method === 'POST') { attempts.push(body); if (fail) throw new Error('断网'); return { id: 'post-string' } }
    return { posts: [], providerMode: 'mock' }
  } })
  x.instance.onShow(); await new Promise(setImmediate)
  x.instance.updateContent({ detail: { value: '今天什么都没拍到，但风很舒服' } }); await x.instance.publish()
  assert.equal(x.instance.data.content, '今天什么都没拍到，但风很舒服')
  assert.ok(x.storage['draft.A'].requestKey); fail = false; await x.instance.publish()
  assert.equal(attempts[0].requestKey, attempts[1].requestKey)
  assert.equal(Object.hasOwn(attempts[0], 'speciesName'), false)
  assert.equal(x.storage.observations.length, 1); assert.equal(x.instance.data.content, '')
  x.instance.onHide()
})

test('manual observation share omits coordinates, image and simulated confidence', async () => {
  let submitted
  const x = page('discover', { observations: [{ id: 'HIST-1', speciesName: '豹猫', confidence: 96, latitude: 22.1234, imagePath: 'wxfile://temp' }] }, {
    trackShare() {}, request: async (route, method, body) => { if (method === 'POST') submitted = body; return { posts: [], providerMode: 'mock' } }
  })
  x.instance.onShow(); await new Promise(setImmediate)
  x.instance.shareLocal({ currentTarget: { dataset: { id: 'HIST-1' } } }); await x.instance.publish()
  assert.equal(submitted.observationId, 'HIST-1'); assert.equal(submitted.speciesName, '豹猫')
  for (const field of ['imagePath', 'latitude', 'longitude', 'confidence']) assert.equal(Object.hasOwn(submitted, field), false)
  x.instance.onHide()
})

test('numeric and HIST string observation details and delete preserve other records', async () => {
  for (const id of [123, 'HIST-1']) {
    const x = page('observation', { observations: [{ id, speciesName: '豹猫' }, { id: 'other', speciesName: '未知' }], interactions: { [String(id)]: { likeCount: 1 }, other: { likeCount: 2 } } })
    x.instance.onLoad({ id: String(id) }); assert.equal(x.instance.data.observation.id, id)
    x.instance.deleteObservation(); await x.modal().success({ confirm: true })
    assert.equal(x.storage.observations.length, 1); assert.equal(x.storage.observations[0].id, 'other')
    assert.equal(Object.hasOwn(x.storage.interactions, String(id)), false); assert.equal(x.storage.interactions.other.likeCount, 2)
  }
})

test('failed associated-post deletion retains scientific observation and old cache', async () => {
  const x = page('observation', { observations: [{ id: 123, speciesName: '豹猫' }] }, { hasShares: () => true, deleteLinkedPosts: async () => { throw new Error('离线') } })
  x.instance.onLoad({ id: '123' }); x.instance.deleteObservation(); await x.modal().success({ confirm: true })
  assert.equal(x.storage.observations.length, 1)
})

test('profile statistics, collection unlock, map markers and species associations still use only observations', () => {
  const storage = { observations: [{ id: 123, speciesName: '豹猫', latitude: 22, longitude: 113 }, { id: 'HIST-1', speciesName: '豹猫' }] }
  const x = page('profile', storage); x.instance.loadUserData()
  assert.equal(x.instance.data.observationCount, 2); assert.equal(x.instance.data.speciesCount, 1)
  const map = page('map', storage); map.instance.loadMapData()
  assert.equal(map.instance.data.markers.length, 1); assert.equal(map.instance.data.markers[0].observationId, 123)
  const collection = page('collection', storage); collection.instance.updateCollection()
  assert.equal(collection.instance.data.unlockedCount, 1)
  const species = page('species', storage); species.instance.onLoad({ name: encodeURIComponent('豹猫') })
  assert.equal(species.instance.data.observationCount, 2)
  for (const name of ['collection', 'map', 'species']) {
    const source = fs.readFileSync(path.join(root, `pages/${name}/${name}.js`), 'utf8')
    assert.ok(source.includes("getStorageSync('observations')") || /getStorageSync\(\s*'observations'/.test(source))
    assert.ok(!source.includes('community.request'))
  }
})

test('simulated identification still requires human confirmation and saves locally before opt-in share', () => {
  let offered
  const x = page('identify', {}, { shareObservation: observation => { offered = observation } })
  x.wx.showLoading = () => {}; x.wx.hideLoading = () => {}
  x.wx.getLocation = options => options.success({ latitude: 22, longitude: 113 })
  x.instance.getLocationName = (lat, lon, callback) => callback('校园附近', null)
  x.instance.data.imagePath = 'wxfile://temp'
  x.instance.identifyAnimal()
  assert.equal(x.instance.data.result.confidence, 96)
  assert.equal(x.instance.data.confirmedSpecies, null)
  x.instance.saveObservation(); assert.equal(x.storage.observations, undefined)
  x.instance.confirmAIResult(); x.instance.saveObservation()
  assert.equal(x.storage.observations.length, 1); assert.equal(x.storage.observations[0].speciesName, '豹猫')
  assert.equal(offered, undefined)
  x.modal().success({ confirm: true }); assert.equal(offered.id, x.storage.observations[0].id)
})

test('stale A feed cannot display private posts after switching identity', async () => {
  const gate = deferred(); let identity = 'A'
  const x = page('discover', {}, { identity: () => identity, request: () => gate.promise })
  x.instance.onShow(); x.instance.onHide(); identity = 'B'; x.instance.onShow()
  assert.equal(x.instance.data.posts.length, 0)
  gate.resolve({ posts: [{ id: 'private-A', createdAt: 1, comments: [] }], providerMode: 'mock' })
  // The first A response is ignored; next B response is a separate request.
  x.service.request = async () => ({ posts: [], providerMode: 'mock' })
  await new Promise(setImmediate)
  assert.equal(x.instance.data.posts.length, 0); x.instance.onHide()
})

test('A post finishing after identity switch cannot delete or reset B draft', async () => {
  const gate = deferred(); let identity = 'A'
  const x = page('discover', { 'draft.B': { content: 'B 的未发送草稿', requestKey: 'B-key' } }, {
    identity: () => identity, draftKey: () => 'draft.' + identity,
    request: async (route, method) => method === 'POST' ? gate.promise : { posts: [], providerMode: 'mock' }
  })
  x.instance.onShow(); await new Promise(setImmediate)
  x.instance.updateContent({ detail: { value: 'A 正在发的自然小事' } })
  const pending = x.instance.publish()
  x.instance.onHide(); identity = 'B'; x.instance.onShow(); gate.resolve({ id: 'post-A' }); await pending
  assert.equal(x.storage['draft.B'].content, 'B 的未发送草稿')
  assert.equal(x.instance.data.content, 'B 的未发送草稿'); assert.equal(x.instance.data.sending, false)
  assert.equal(x.storage['draft.A'], undefined); x.instance.onHide()
})
