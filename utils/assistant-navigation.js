const { findAction, pageIds } = require('../shared/assistant/catalog')
let opening = false

function openAssistant(pageId) {
  if (opening) return
  opening = true
  wx.navigateTo({
    url: '/pages/assistant/assistant' + (pageIds.includes(pageId) ? '?from=' + pageId : ''),
    fail: () => wx.showToast({ title: '请从「我的」打开 AI 助手', icon: 'none' }),
    complete: () => { opening = false }
  })
}

function followAction(id) {
  const action = findAction(id)
  if (!action) return
  wx.switchTab({
    url: '/pages/' + action.pageId + '/' + action.pageId,
    fail: () => wx.showToast({ title: '请从底部进入「' + action.name + '」', icon: 'none' })
  })
}

module.exports = { openAssistant, followAction }
