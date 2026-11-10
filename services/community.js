const config = require('../config/community.example.js')
let connecting = null
let sessionVersion = 0
const sessionKey = 'community.dev.session.v1'
const identityListeners = new Set()
function raw(path, method, data, token) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: config.API_BASE_URL + path, method, data,
      header: { 'content-type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      timeout: 10000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data)
        else { const error = new Error(res.data && res.data.error ? res.data.error.message : '本地服务请求失败'); error.code = res.data && res.data.error && res.data.error.code; reject(error) }
      },
      fail() { reject(new Error('无法连接本地社区，请检查服务与 API 地址')) }
    })
  })
}
async function connect(identity) {
  if (!config.DEVELOPMENT) throw new Error('当前仅支持本地开发身份，正式登录尚未接入')
  const version = ++sessionVersion
  const result = await raw('/dev/sessions', 'POST', { identity })
  const session = { ...result, identity }
  if (version === sessionVersion) {
    const previous = cachedIdentity()
    wx.setStorageSync(sessionKey, session)
    if (previous !== identity) identityListeners.forEach(listener => listener(identity))
  }
  return session
}
async function session() {
  const cached = wx.getStorageSync(sessionKey)
  if (cached && cached.token) return cached
  if (!connecting) connecting = connect(config.DEFAULT_IDENTITY).finally(() => { connecting = null })
  return connecting
}
async function request(path, method = 'GET', data) {
  const current = await session()
  try { return await raw(path, method, data, current.token) }
  catch (error) {
    if (error.code === 'unauthorized') {
      const renewed = await renew(current)
      return raw(path, method, data, renewed.token)
    }
    throw error
  }
}
async function renew(current) {
  const result = await raw('/dev/sessions', 'POST', { identity: current.identity })
  const renewed = { ...result, identity: current.identity }
  if ((wx.getStorageSync(sessionKey) || {}).token === current.token) wx.setStorageSync(sessionKey, renewed)
  return renewed
}
function cachedIdentity() {
  try {
    const current = wx.getStorageSync(sessionKey)
    return typeof current?.token === 'string' && ['A', 'B', 'C'].includes(current.identity) ? current.identity : ''
  } catch { return '' }
}
function onIdentityChange(listener) {
  identityListeners.add(listener)
  return () => identityListeners.delete(listener)
}
function key(prefix) { return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 12) }
function identity() { return (wx.getStorageSync(sessionKey) || {}).identity || config.DEFAULT_IDENTITY }
function draftKey() { return 'community.draft.v1.' + identity() }
function shareObservation(observation) {
  // Images, confidence and locations intentionally stay on device.
  wx.setStorageSync('community.pendingShare.v1', {
    observationId: String(observation.id), speciesName: observation.speciesName || '',
    content: `今天记录了${observation.speciesName || '一位自然邻居'}，想和大家分享这次观察。`
  })
  wx.switchTab({ url: '/pages/discover/discover' })
}
async function linkedPosts(observationId) {
  let before = '', posts = []
  do {
    const page = await request('/posts?mine=true&limit=50&observationId=' + encodeURIComponent(String(observationId)) + (before ? '&before=' + encodeURIComponent(before) : ''))
    posts = posts.concat(page.posts); before = page.nextCursor
  } while (before)
  return posts
}
function trackShare(observationId) {
  if (!observationId) return
  const links = wx.getStorageSync('community.observationLinks.v1') || {}
  links[String(observationId)] = Array.from(new Set((links[String(observationId)] || []).concat(identity())))
  wx.setStorageSync('community.observationLinks.v1', links)
}
function hasShares(observationId) { return !!(wx.getStorageSync('community.observationLinks.v1') || {})[String(observationId)] }
async function deleteLinkedPosts(observationId) {
  const links = wx.getStorageSync('community.observationLinks.v1') || {}
  // Each identity authenticates separately. No authorId is trusted by the server.
  for (const owner of links[String(observationId)] || []) {
    const temporary = await raw('/dev/sessions', 'POST', { identity: owner })
    let before = '', posts = []
    do {
      const page = await raw('/posts?mine=true&limit=50&observationId=' + encodeURIComponent(String(observationId)) + (before ? '&before=' + encodeURIComponent(before) : ''), 'GET', undefined, temporary.token)
      posts = posts.concat(page.posts); before = page.nextCursor
    } while (before)
    for (const post of posts) await raw('/posts/' + post.id, 'DELETE', undefined, temporary.token)
  }
  delete links[String(observationId)]; wx.setStorageSync('community.observationLinks.v1', links)
}
module.exports = { config, request, session, connect, renew, identity, cachedIdentity, onIdentityChange, key, draftKey, shareObservation, linkedPosts, trackShare, hasShares, deleteLinkedPosts }
