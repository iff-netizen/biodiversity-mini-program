const community = require('../../services/community')
const { requestChat } = require('../../services/assistant')
const storage = require('../../utils/assistant-storage')
const { followAction } = require('../../utils/assistant-navigation')
const { assistantName, limits, groups, faq, initialFaqIds, pageIds, knowledgeVersion, findFaq, findHelp, findAction, guide } = require('../../shared/assistant/catalog')
const { search } = require('../../shared/assistant/retrieval')

const sourceLabels = { guide: '功能指南', ai: 'AI 回答', mock: '演示回复' }
const fresh = () => ({ id: community.key('chat'), draft: '', turns: [], updatedAt: Date.now() })
const eventId = event => event.currentTarget.dataset.id
const identityNow = () => community.cachedIdentity() || 'guest'
const toast = title => wx.showToast({ title, icon: 'none' })
const confirm = options => new Promise(resolve => wx.showModal({ ...options, success: result => resolve(result.confirm), fail: () => resolve(false) }))
const choose = items => new Promise(resolve => wx.showActionSheet({ itemList: items, success: result => resolve(result.tapIndex), fail: () => resolve(-1) }))

Page({
  data: {
    assistantName: '', maxLength: 1000, turns: [], draft: '', busy: false, faqOpen: true, faqGroups: [],
    identity: '', historyOpen: false, recent: [], scrollTarget: '', newReply: false, keyboard: 0, refreshKnowledge: false
  },

  onLoad(options = {}) {
    this.alive = true
    this.visible = true
    this.atBottom = true
    this.context = pageIds.includes(options.from) ? { pageId: options.from } : {}
    this.batch = 0
    this.setData({ assistantName, maxLength: limits.message })
    this.restoreIdentity(identityNow())
    this.stopListening = community.onIdentityChange(identity => {
      if (this.alive && this.connectingIdentity !== identity && identity !== this.data.identity) {
        this.cancelPending()
        this.persist()
        this.restoreIdentity(identity)
      }
    })
  },

  onReady() { this.measure() },
  onResize() { this.measure() },
  onShow() {
    this.visible = true
    const identity = identityNow()
    if (this.active && identity !== this.data.identity) this.restoreIdentity(identity)
  },
  onHide() {
    this.visible = false
    this.cancelPending()
    this.persist()
    this.setData({ keyboard: 0 })
  },
  onUnload() {
    this.visible = false
    this.cancelPending()
    this.persist()
    this.alive = false
    this.stopListening?.()
  },

  measure() {
    wx.createSelectorQuery().select('#timeline').boundingClientRect(rect => {
      if (rect) this.viewport = rect.height
    }).exec()
  },
  scroll(event) {
    const { scrollTop, scrollHeight } = event.detail
    this.atBottom = !this.viewport || scrollHeight - scrollTop - this.viewport < 60
    if (this.atBottom && this.data.newReply) this.setData({ newReply: false })
  },
  bottom() {
    this.atBottom = true
    this.setData({ scrollTarget: '', newReply: false }, () => {
      if (this.alive && this.visible) this.setData({ scrollTarget: 'timeline-end' })
    })
  },
  keyboardChanged(event) {
    const follow = this.atBottom
    this.setData({ keyboard: event.detail.height || 0 }, () => {
      this.measure()
      if (follow) this.bottom()
    })
  },

  restoreIdentity(identity) {
    this.uncertainRequest = null
    this.store = storage.load(identity)
    this.active = this.store.sessions.find(item => item.id === this.store.activeId) || this.store.sessions[0] || fresh()
    this.setData({ identity, draft: this.active.draft, faqOpen: !this.active.turns.length, historyOpen: false, refreshKnowledge: false })
    this.showFaq()
    this.render()
    this.bottom()
  },
  persist() {
    if (!this.active || (!this.active.turns.length && !this.active.draft && !this.store.sessions.length)) return
    const saved = storage.save(this.data.identity, this.active, this.store.sessions)
    if (saved) {
      this.store = saved
      this.active = saved.sessions[0]
    } else if (!this.storageWarning) {
      this.storageWarning = true
      toast('本机空间不足，聊天可能无法恢复')
    }
  },
  render() {
    const turns = this.active.turns.map(turn => {
      const result = turn.result
      return {
        ...turn, sourceLabel: sourceLabels[result?.sourceType] || '',
        actions: (result?.actionIds || []).filter(id => typeof id === 'string' && findAction(id))
          .map(id => ({ id, label: findAction(id).label })),
        followUps: (result?.followUpIds || []).map(findFaq).filter(Boolean)
      }
    })
    this.setData({ turns })
  },
  showFaq() {
    const extra = faq.filter(item => !initialFaqIds.includes(item.id))
    const all = this.batch === 0 ? initialFaqIds.map(findFaq) : extra.slice((this.batch - 1) * 6, this.batch * 6)
    this.setData({ faqGroups: groups.map(name => ({ name, items: all.filter(item => item.category === name) })).filter(group => group.items.length) })
  },
  nextFaq() {
    this.batch = (this.batch + 1) % (1 + Math.ceil((faq.length - initialFaqIds.length) / 6))
    this.showFaq()
  },
  toggleFaq() {
    const faqOpen = !this.data.faqOpen
    this.setData({ faqOpen }, () => { if (faqOpen) this.bottom() })
  },
  input(event) {
    this.active.draft = event.detail.value.slice(0, limits.message)
    this.setData({ draft: this.active.draft })
  },
  sendDraft() { return this.send(this.active.draft) },
  sendFaq(event) {
    const item = findFaq(eventId(event))
    if (!item || this.operation) return
    const key = this.active.id + ':' + item.id
    if (this.lastQuick?.key === key && Date.now() - this.lastQuick.time < 400) return
    this.lastQuick = { key, time: Date.now() }
    return this.send(item.title, { faqId: item.id })
  },
  retry(event) {
    const turn = this.active.turns.find(item => item.id === eventId(event))
    if (turn && ['failed', 'cancelled'].includes(turn.status)) return this.send(turn.content, { faqId: turn.faqId, retry: turn })
  },
  isCurrent(op) { return this.alive && this.visible && this.operation === op && op.identity === this.data.identity },

  async send(value, { faqId, retry } = {}) {
    if (this.operation || !this.visible) return
    const content = value.trim()
    if (!content || content.length > limits.message) return
    const entry = faqId && findHelp(faqId)
    const local = entry ? guide(entry) : search(content, storage.modelHistory(this.active.turns)).answer
    const op = { identity: this.data.identity }
    this.operation = op
    this.setData({ busy: true })
    try {
      if (!local && op.identity === 'guest') {
        const index = await choose(['使用体验身份 A', '使用体验身份 B', '使用体验身份 C'])
        if (index < 0 || !this.isCurrent(op)) return
        this.connectingIdentity = ['A', 'B', 'C'][index]
        try { await community.connect(this.connectingIdentity) }
        finally { this.connectingIdentity = '' }
        if (!this.isCurrent(op) || identityNow() === 'guest') return
        this.persist()
        op.identity = identityNow()
        this.restoreIdentity(op.identity)
        if (!faqId && !retry) {
          this.active.draft = content
          this.setData({ draft: content })
        }
        retry = null
      }
      if (!local && !storage.wasNoticed(op.identity) && this.noticed !== op.identity) {
        const accepted = await confirm({
          title: '发送前说明', content: '真实模式下，你发送的文字会交由 AI 服务处理。聊天记录保存在本机，可随时清空。',
          confirmText: '继续发送'
        })
        if (!accepted || !this.isCurrent(op)) return
        this.noticed = op.identity
        storage.setNoticed(op.identity)
      }
      if (!this.isCurrent(op)) return
      const turns = this.active.turns
      const retryIndex = retry ? turns.findIndex(item => item.id === retry.id) : -1
      const history = storage.modelHistory(retryIndex < 0 ? turns : turns.slice(0, retryIndex))
      const id = retry?.id || community.key('message')
      const turn = { id, content, ...(faqId ? { faqId } : {}), status: 'pending' }
      op.turnId = id
      if (retryIndex < 0) turns.push(turn)
      else turns[retryIndex] = turn
      if (!faqId && !retry) this.active.draft = ''
      this.setData({ draft: this.active.draft, faqOpen: false })
      this.persist()
      this.render()
      if (retryIndex < 0) this.bottom()

      let answer = local
      if (!answer) {
        const replay = this.uncertainRequest?.turnId === id ? this.uncertainRequest.payload : null
        if (replay) this.uncertainRequest = null
        op.payload = replay || {
          clientSessionId: this.active.id, requestId: community.key('request'), message: content,
          history, context: this.context, knowledgeVersion
        }
        op.request = requestChat(op.payload, op.identity)
        answer = await op.request.promise
      }
      if (!this.isCurrent(op)) return
      this.updateTurn(id, { status: 'success', result: answer })
      if (answer.refreshKnowledge) this.setData({ refreshKnowledge: true })
      if (this.atBottom) this.bottom()
      else this.setData({ newReply: true })
    } catch (error) {
      if (!this.isCurrent(op)) return
      if (op.turnId) {
        if (error.deliveryUncertain) this.uncertainRequest = { turnId: op.turnId, payload: op.payload }
        this.updateTurn(op.turnId, { status: 'failed', error: error.message })
        if (this.atBottom) this.bottom()
        else this.setData({ newReply: true })
      } else toast(error.message || '无法连接本地助手，请重试')
    } finally {
      if (this.operation === op) {
        this.operation = null
        this.setData({ busy: false })
      }
    }
  },

  updateTurn(id, change) {
    const index = this.active.turns.findIndex(turn => turn.id === id)
    if (index < 0) return
    this.active.turns[index] = { ...this.active.turns[index], ...change }
    this.persist()
    this.render()
  },
  cancelPending() {
    const op = this.operation
    if (!op) return
    this.operation = null
    op.request?.cancel()
    if (op.turnId) this.updateTurn(op.turnId, { status: 'cancelled' })
    this.setData({ busy: false })
  },
  copy(event) {
    const answer = this.active.turns.find(turn => turn.id === eventId(event))?.result
    if (answer) wx.setClipboardData({ data: answer.reply })
  },
  navigate(event) {
    this.persist()
    followAction(eventId(event))
  },

  async more() {
    const options = ['新对话', '最近会话', '清空聊天记录']
    const selection = await choose(options)
    if (!this.alive || !this.visible) return
    if (selection === 0) this.newChat()
    if (selection === 1) this.showHistory()
    if (selection === 2) await this.clearHistory()
  },
  newChat() {
    this.cancelPending()
    this.persist()
    this.useSession(fresh())
    this.persist()
  },
  async clearHistory() {
    const identity = this.data.identity
    const ok = await confirm({
      title: '清空聊天记录',
      content: '将删除当前身份在这台设备上的全部助手聊天和草稿。清空操作只作用于本机记录。',
      confirmText: '清空', confirmColor: '#a33025'
    })
    if (!ok || !this.alive || !this.visible || identity !== this.data.identity) return
    this.cancelPending()
    if (!storage.clear(identity)) return toast('本机记录未能清空')
    this.store = { sessions: [], activeId: '' }
    this.useSession(fresh())
  },
  showHistory() {
    this.persist()
    const recent = this.store.sessions.filter(item => item.turns.length || item.draft).map(item => ({
      id: item.id, title: (item.turns[0]?.content || item.draft).slice(0, 42),
      time: new Date(item.updatedAt).toLocaleString(), active: item.id === this.active.id
    }))
    this.setData({ historyOpen: true, recent })
  },
  closeHistory() { this.setData({ historyOpen: false }) },
  selectHistory(event) {
    const id = eventId(event)
    if (id === this.active.id) return this.closeHistory()
    this.cancelPending()
    this.persist()
    const session = this.store.sessions.find(item => item.id === id)
    if (session) {
      this.useSession(session)
      this.persist()
    } else this.showHistory()
  },
  useSession(session) {
    this.uncertainRequest = null
    this.active = session
    this.setData({ draft: session.draft, faqOpen: !session.turns.length, historyOpen: false })
    this.render()
    this.bottom()
  }
})
