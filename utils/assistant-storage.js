const { limits } = require('../shared/assistant/catalog')
const key = identity => 'assistant.history.v1.' + (['A', 'B', 'C'].includes(identity) ? identity : 'guest')
const fabKey = 'assistant.fab.v1'
const cutoff = now => now - limits.days * 86400000
const maxStoredChars = 145000

function read(name) {
  try { return wx.getStorageSync(name) } catch { return undefined }
}
function write(name, value) {
  try { wx.setStorageSync(name, value); return true } catch { return false }
}
function usable(value, now) {
  return value && typeof value.id === 'string' && Number.isFinite(value.updatedAt) &&
    value.updatedAt >= cutoff(now) && value.updatedAt <= now && Array.isArray(value.turns)
}
function load(identity, now = Date.now()) {
  const stored = read(key(identity))
  const sessions = Array.isArray(stored?.sessions) ? stored.sessions.filter(item => usable(item, now)).slice(0, limits.sessions) : []
  if (Array.isArray(stored?.sessions) && sessions.length !== stored.sessions.length) {
    if (sessions.length) write(key(identity), { sessions, activeId: stored.activeId })
    else clear(identity)
  }
  return {
    sessions: sessions.map(item => ({
      ...item, draft: typeof item.draft === 'string' ? item.draft.slice(0, limits.message) : '',
      turns: item.turns.slice(-limits.messages / 2).filter(turn => turn && typeof turn.content === 'string')
        .map(turn => turn.status === 'pending' ? { ...turn, status: 'cancelled' } : turn)
    })),
    activeId: stored?.activeId || ''
  }
}

function save(identity, active, others, now = Date.now()) {
  const current = { ...active, updatedAt: now, turns: active.turns.slice(-limits.messages / 2) }
  const sessions = [current, ...others.filter(item => item.id !== current.id && usable(item, now))].slice(0, limits.sessions)
  const value = { activeId: current.id, sessions }
  while (JSON.stringify(value).length > maxStoredChars) {
    if (sessions.length > 1) sessions.pop()
    else if (current.turns.length) current.turns.shift()
    else return null
  }
  return write(key(identity), value) ? value : null
}
function clear(identity) {
  try { wx.removeStorageSync(key(identity)); return true } catch { return false }
}
function wasNoticed(identity) { return read(key(identity) + '.notice') === true }
function setNoticed(identity) { return write(key(identity) + '.notice', true) }
function showFab() { return read(fabKey + '.visible') !== false }
function setShowFab(value) { return write(fabKey + '.visible', value) }
function readPosition() { return read(fabKey + '.position') }
function savePosition(value) { return write(fabKey + '.position', value) }
function sawTip() { return read(fabKey + '.tip') === true }
function markTip() { return write(fabKey + '.tip', true) }

function modelHistory(turns) {
  const history = []
  let chars = 0
  for (let i = turns.length - 1; i >= 0 && history.length < limits.history; i--) {
    const turn = turns[i]
    if (turn.status !== 'success' || !turn.result?.reply || turn.result.sourceType === 'mock') continue
    const pairLength = turn.content.length + turn.result.reply.length
    if (chars + pairLength > limits.historyChars) break
    chars += pairLength
    history.unshift({ role: 'user', content: turn.content }, { role: 'assistant', content: turn.result.reply })
  }
  return history
}

module.exports = { load, save, clear, wasNoticed, setNoticed, showFab, setShowFab, readPosition, savePosition, sawTip, markTip, modelHistory }
