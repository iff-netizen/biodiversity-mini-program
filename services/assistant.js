const community = require('./community')
const { findAction, findFaq, limits } = require('../shared/assistant/catalog')

function requestChat(input, identity) {
  let task, cancelled = false
  const check = () => {
    if (cancelled || community.cachedIdentity() !== identity) throw new Error('这次回答已取消。')
  }
  const request = token => new Promise((resolve, reject) => {
    check()
    task = wx.request({
      url: community.config.API_BASE_URL + '/assistant/chat', method: 'POST',
      header: { 'content-type': 'application/json', Authorization: 'Bearer ' + token },
      data: input, timeout: 35000,
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) return resolve(response.data)
        const error = new Error(response.data?.error?.message || '本地服务暂时不可用，请重试。')
        error.code = response.data?.error?.code
        reject(error)
      },
      fail(error) {
        const failure = new Error(/timeout/i.test(error.errMsg || '') ? '小黄想得有点久，请重试。' : '无法连接本地助手，请检查网络和服务是否启动。')
        failure.deliveryUncertain = true
        reject(failure)
      }
    })
  })
  const promise = (async () => {
    check()
    const current = await community.session()
    check()
    if (current.identity !== identity) throw new Error('本地身份已切换，请重新发送。')
    let answer
    try { answer = await request(current.token) }
    catch (error) {
      if (error.code !== 'unauthorized') throw error
      check()
      const renewed = await community.renew(current)
      answer = await request(renewed.token)
    }
    check()
    if (!answer || answer.requestId !== input.requestId || typeof answer.reply !== 'string' || !answer.reply.trim() ||
        answer.reply.length > limits.reply || !['ai', 'guide', 'mock'].includes(answer.sourceType)) {
      throw new Error('本地服务返回了无效回复，请重试。')
    }
    return {
      reply: answer.reply, sourceType: answer.sourceType, refreshKnowledge: answer.refreshKnowledge === true,
      actionIds: Array.isArray(answer.actionIds) ? answer.actionIds.filter(id => typeof id === 'string' && findAction(id)).slice(0, 2) : [],
      followUpIds: Array.isArray(answer.followUpIds) ? answer.followUpIds.filter(id => typeof id === 'string' && findFaq(id)).slice(0, 3) : []
    }
  })()
  return { promise, cancel() { cancelled = true; task?.abort() } }
}

module.exports = { requestChat }
