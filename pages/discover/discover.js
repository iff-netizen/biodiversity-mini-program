const community = require('../../services/community')

Page({
  data: {
    posts: [], localPosts: [], view: 'public', content: '', share: null,
    memoryAllowed: true, sending: false, error: '', loading: false,
    identity: 'A', providerMode: '', aiStatus: null, nextCursor: null, requestKey: null
  },
  onShow() {
    this._active = true
    this._pageCursor = ''
    this._requestKey = null
    this.setData({ identity: community.identity(), sending: this.data.identity === community.identity() ? this.data.sending : false,
      posts: [], content: '', share: null, requestKey: null, memoryAllowed: true, ...(wx.getStorageSync(community.draftKey()) || {}) })
    const pending = wx.getStorageSync('community.pendingShare.v1')
    if (pending) {
      this.setData({ share: pending, content: pending.content, view: 'public' })
      wx.removeStorageSync('community.pendingShare.v1'); this.saveDraft(true)
    }
    this.loadLocalPosts(); this.loadPosts(); this.stopPolling()
    this._poll = setInterval(() => { if (this.data.view !== 'local') this.loadPosts() }, community.config.POLL_INTERVAL_MS)
  },
  onHide() { this._active = false; this.stopPolling() },
  onUnload() { this._active = false; this.stopPolling() },
  stopPolling() { if (this._poll) { clearInterval(this._poll); this._poll = null } },
  async onPullDownRefresh() { this._pageCursor = ''; await this.loadPosts(); this.loadLocalPosts(); wx.stopPullDownRefresh() },
  async loadPosts() {
    if (this.data.view === 'local') return
    if (this._loading) { this._loadAgain = true; return }
    this._loading = true
    const view = this.data.view, cursor = this._pageCursor || '', identity = community.identity()
    this.setData({ loading: true })
    try {
      const result = await community.request('/posts?limit=20' + (view === 'mine' ? '&mine=true' : '') + (cursor ? '&before=' + encodeURIComponent(cursor) : ''))
      if (!this._active || view !== this.data.view || identity !== community.identity() || cursor !== (this._pageCursor || '')) return
      this.setData({ posts: result.posts.map(p => ({ ...p, time: new Date(p.createdAt).toLocaleString(), commentCount: p.comments.length })), providerMode: result.providerMode, aiStatus: result.aiStatus || null, nextCursor: result.nextCursor, error: '' })
    } catch (error) { if (this._active) this.setData({ error: error.message }) }
    finally {
      this._loading = false
      if (this._active) {
        this.setData({ loading: false })
        if (this._loadAgain) { this._loadAgain = false; this.loadPosts() }
      }
    }
  },
  switchView(e) {
    this._pageCursor = ''
    this.setData({ view: e.currentTarget.dataset.view, posts: [], nextCursor: null })
    this.loadLocalPosts(); this.loadPosts()
  },
  nextPage() { this._pageCursor = this.data.nextCursor || ''; this.loadPosts() },
  firstPage() { this._pageCursor = ''; this.loadPosts() },
  updateContent(e) { this.setData({ content: e.detail.value }); this.saveDraft(true) },
  updateMemory(e) { this.setData({ memoryAllowed: e.detail.value }); this.saveDraft(true) },
  clearShare() { this.setData({ share: null }); this.saveDraft(true) },
  saveDraft(changed = false) {
    if (changed) { this._requestKey = null; this.setData({ requestKey: null }) }
    wx.setStorageSync(community.draftKey(), { content: this.data.content, share: this.data.share, memoryAllowed: this.data.memoryAllowed, requestKey: this._requestKey || this.data.requestKey || null })
  },
  async publish() {
    if (this.data.sending || !this.data.content.trim()) return
    this._requestKey = this._requestKey || this.data.requestKey || community.key('post'); this.saveDraft()
    const actor = community.identity(), savedDraftKey = community.draftKey(), submittedKey = this._requestKey
    const content = this.data.content.trim(), share = this.data.share
    this.setData({ sending: true })
    try {
      if (share) community.trackShare(share.observationId)
      await community.request('/posts', 'POST', { content, requestKey: this._requestKey, memoryAllowed: this.data.memoryAllowed,
        ...(share ? { speciesName: share.speciesName, observationId: share.observationId } : {}) })
      if ((wx.getStorageSync(savedDraftKey) || {}).requestKey === submittedKey) wx.removeStorageSync(savedDraftKey)
      if (actor !== community.identity()) return
      this._requestKey = null
      this.setData({ content: '', share: null, requestKey: null, view: 'public' })
      this._pageCursor = ''
      wx.showToast({ title: '已公开发布', icon: 'success' }); await this.loadPosts()
    } catch (error) { if (actor === community.identity()) this.showError(error) }
    finally { if (actor === community.identity()) this.setData({ sending: false }) }
  },
  showError(error) { this.setData({ error: error.message }); wx.showToast({ title: error.message, icon: 'none' }) },
  findPost(e) { return this.data.posts.find(p => p.id === e.currentTarget.dataset.id) },
  async reaction(e, type) {
    const post = this.findPost(e); if (!post) return
    const lock = post.id + ':' + type
    this._reactionLocks = this._reactionLocks || {}
    if (this._reactionLocks[lock]) return
    this._reactionLocks[lock] = true
    try { await community.request(`/posts/${post.id}/reactions/${type}`, 'PUT', { active: type === 'like' ? !post.liked : !post.seen }); await this.loadPosts() }
    catch (error) { this.showError(error) }
    finally { delete this._reactionLocks[lock] }
  },
  toggleLike(e) { return this.reaction(e, 'like') },
  toggleSeen(e) { return this.reaction(e, 'seen') },
  addComment(e) {
    const postId = e.currentTarget.dataset.id, replyToCommentId = e.currentTarget.dataset.comment || null
    this._commentRetries = this._commentRetries || {}
    wx.showModal({ title: replyToCommentId ? '回复这条评论' : '发表评论', editable: true, placeholderText: '说说你的发现或想法',
      success: async res => {
        if (!res.confirm || !res.content || !res.content.trim()) return
        const content = res.content.trim(), retryId = JSON.stringify([postId, replyToCommentId, content])
        const requestKey = this._commentRetries[retryId] || community.key('comment'); this._commentRetries[retryId] = requestKey
        try { await community.request(`/posts/${postId}/comments`, 'POST', { content, requestKey, ...(replyToCommentId ? { replyToCommentId } : {}) }); delete this._commentRetries[retryId]; await this.loadPosts() }
        catch (error) { this.showError(error) }
      }
    })
  },
  commentMenu(e) {
    const id = e.currentTarget.dataset.comment
    wx.showActionSheet({ itemList: ['隐藏这条 AI 评论', '反馈内容不合适', '反馈重复或生硬'], success: async res => {
      try { await community.request(`/comments/${id}/feedback`, 'POST', { reason: ['用户隐藏', '内容不合适', '重复或生硬'][res.tapIndex], hide: res.tapIndex === 0 }); await this.loadPosts() }
      catch (error) { this.showError(error) }
    } })
  },
  postMenu(e) {
    const post = this.findPost(e); if (!post || !post.isMine) return
    const choices = ['编辑正文', post.visibility === 'public' ? '转为私密' : '重新公开（不重新抽签）', post.memoryAllowed ? '撤回共享记忆许可' : '允许共享记忆', '删除动态（保留个人观察）']
    wx.showActionSheet({ itemList: choices, success: res => {
      if (res.tapIndex === 0) return wx.showModal({ title: '编辑动态', editable: true, content: post.content, success: result => {
        if (result.confirm && result.content && result.content.trim()) this.mutate(post.id, 'PATCH', { content: result.content.trim() })
      } })
      wx.showModal({ title: choices[res.tapIndex], content: '会取消等待中的 AI 任务；涉及的记忆引用评论会撤回。个人观察继续保留。', success: result => {
        if (!result.confirm) return
        if (res.tapIndex === 1) this.mutate(post.id, 'PATCH', { visibility: post.visibility === 'public' ? 'private' : 'public' })
        if (res.tapIndex === 2) this.mutate(post.id, 'PATCH', { memoryAllowed: !post.memoryAllowed })
        if (res.tapIndex === 3) this.mutate(post.id, 'DELETE')
      } })
    } })
  },
  async mutate(id, method, data) { try { await community.request('/posts/' + id, method, data); await this.loadPosts() } catch (error) { this.showError(error) } },
  loadLocalPosts() {
    const interactions = wx.getStorageSync('interactions') || {}
    const localPosts = (wx.getStorageSync('observations') || []).map((o, i) => ({ ...o, id: String(o.id == null ? i : o.id),
      ...(interactions[String(o.id == null ? i : o.id)] || { liked: false, likeCount: 0, seen: false, seenCount: 0, comments: [] }) }))
    this.setData({ localPosts })
  },
  shareLocal(e) {
    const post = this.data.localPosts.find(p => p.id === String(e.currentTarget.dataset.id)); if (!post) return
    this.setData({ view: 'public', content: `今天记录了${post.speciesName || '自然邻居'}，想和大家分享这次观察。`, share: { observationId: post.id, speciesName: post.speciesName || '' } }); this.saveDraft(true)
  },
  localInteraction(e) {
    const id = String(e.currentTarget.dataset.id), type = e.currentTarget.dataset.type
    const interactions = wx.getStorageSync('interactions') || {}
    const current = interactions[id] || { liked: false, likeCount: 0, seen: false, seenCount: 0, comments: [] }
    const save = () => { interactions[id] = current; wx.setStorageSync('interactions', interactions); this.loadLocalPosts() }
    if (type === 'comment') return wx.showModal({ title: '本机评论（不会公开）', editable: true, success: res => {
      if (res.confirm && res.content && res.content.trim()) { current.comments = (current.comments || []).concat({ id: community.key('local'), username: '自然观察者', content: res.content.trim() }); save() }
    } })
    const field = type === 'like' ? 'liked' : 'seen', count = type === 'like' ? 'likeCount' : 'seenCount'
    current[field] = !current[field]; current[count] = Math.max(0, (current[count] || 0) + (current[field] ? 1 : -1)); save()
  },
  goToSpeciesDetail(e) { wx.navigateTo({ url: '/pages/species/species?name=' + encodeURIComponent(e.currentTarget.dataset.name) }) },
  retry() { this.loadPosts() }
})
