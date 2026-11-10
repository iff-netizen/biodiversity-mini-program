'use strict'
const { createHash } = require('node:crypto')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { fail, fields } = require('../community')
const { actions, faq, findFaq, knowledgeVersion, pageIds, limits } = require('../../../shared/assistant/catalog')
const { search } = require('../../../shared/assistant/retrieval')
const { defaults } = require('./config')

const systemPrompt = readFileSync(join(__dirname, '../../prompts/assistant-bot.md'), 'utf8').trim()
const idPattern = /^[a-zA-Z0-9_-]{8,80}$/
const userErrors = {
  missing_credentials: [503, '小黄暂未接通 AI 服务，请联系项目维护者。'],
  provider_insufficient_balance: [503, 'AI 服务额度不足，请联系项目维护者。'],
  provider_http_401: [503, 'AI 服务认证失败，请联系项目维护者。'],
  provider_http_403: [503, 'AI 服务访问受限，请联系项目维护者。'],
  provider_429: [429, 'AI 服务现在较忙，请稍后重试。'],
  provider_timeout: [504, '小黄想得有点久，请稍后重试。'],
  provider_refusal: [422, '小黄暂时无法回答这条消息，可以换个问法。'],
  provider_empty: [502, '小黄这次没有收到有效回复，请重试。'],
  provider_truncated: [502, '回复没有完整返回，可以重试或把问题分开问。'],
  provider_invalid_json: [502, 'AI 回复格式有误，请重试。'],
  provider_network: [502, '本地服务未能连接 AI，请稍后重试。'],
  assistant_cancelled: [409, '这次回答已取消。']
}

function readText(value, limit, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) fail(400, 'invalid_text', label + '长度不合适')
  return value.trim()
}

function validate(body) {
  fields(body, ['clientSessionId', 'requestId', 'message', 'history', 'context', 'knowledgeVersion'])
  for (const key of ['clientSessionId', 'requestId']) {
    if (typeof body[key] !== 'string' || !idPattern.test(body[key])) fail(400, 'invalid_id', '请求标识无效')
  }
  const message = readText(body.message, limits.message, '消息')
  if (!Array.isArray(body.history) || body.history.length > limits.history) fail(400, 'invalid_history', '会话历史过长')
  let total = 0
  const history = body.history.map(item => {
    fields(item, ['role', 'content'])
    if (!['user', 'assistant'].includes(item.role)) fail(400, 'invalid_role', '会话历史角色无效')
    const content = readText(item.content, item.role === 'user' ? limits.message : limits.reply, '历史消息')
    total += content.length
    return { role: item.role, content }
  })
  if (total > limits.historyChars) fail(400, 'invalid_history', '会话历史过长')
  const context = body.context ?? {}
  fields(context, ['pageId'])
  if (context.pageId !== undefined && !pageIds.includes(context.pageId)) fail(400, 'invalid_page', '页面上下文无效')
  if (typeof body.knowledgeVersion !== 'string' || !/^[\w-]{1,64}$/.test(body.knowledgeVersion)) fail(400, 'invalid_version', '功能目录版本无效')
  return { requestId: body.requestId, clientSessionId: body.clientSessionId, message, history, context, knowledgeVersion: body.knowledgeVersion }
}

function checkedReply(output, allowed) {
  let parsed
  try { parsed = JSON.parse(output) } catch { throw new Error('provider_invalid_json') }
  const keys = ['reply', 'actionIds', 'followUpIds']
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length !== keys.length ||
      keys.some(key => !Object.hasOwn(parsed, key)) || typeof parsed.reply !== 'string' || parsed.reply.length > limits.reply ||
      ['actionIds', 'followUpIds'].some(key => !Array.isArray(parsed[key]) || parsed[key].some(id => typeof id !== 'string'))) {
    throw new Error('provider_invalid_json')
  }
  // Output is plain text. Source URLs are omitted because the supplied facts contain no public links.
  const reply = parsed.reply.replace(/\[([^\]]+)\]\(\s*(?:https?:\/\/|weixin:\/\/)[^)]*\)/gi, '$1')
    .replace(/(?:https?:\/\/|weixin:\/\/)[^\s<>"，。！？）】]+/gi, '').trim()
  if (!reply) throw new Error('provider_empty')
  return {
    reply, actionIds: [...new Set(parsed.actionIds.filter(id => allowed.includes(id)))].slice(0, 2),
    followUpIds: [...new Set(parsed.followUpIds.filter(findFaq))].slice(0, 3)
  }
}

const privateRequest = /(?:泄露|打印|显示|读取|导出|透露|给我|告诉我).{0,15}(?:api.?key|密钥|系统提示词|他人.{0,6}(?:记录|聊天)|别人的.{0,6}(?:记录|聊天))/i

function providerMessages(input, entries, allowed) {
  const page = Object.values(actions).find(action => action.pageId === input.context.pageId)
  const product = entries.map(({ id, title, status, summary, steps, prerequisites, limitations }) =>
    ({ id, title, status, summary, steps, prerequisites, limitations }))
  return [
    { role: 'system', content: systemPrompt + '\n\n本轮可信应用配置 JSON：' + JSON.stringify({
      page: page ? { id: page.pageId, name: page.name } : null,
      product, actions: allowed, followUpIds: faq.map(({ id, title }) => ({ id, title }))
    }) },
    // Keep previous assistant turns in the same JSON format as the next completion.
    ...input.history.map(item => item.role === 'assistant' ? {
      role: 'assistant', content: JSON.stringify({ reply: item.content, actionIds: [], followUpIds: [] })
    } : item),
    { role: 'user', content: input.message }
  ]
}

class Assistant {
  constructor({ provider, communityCalls, sharedHourlyLimit, config, log, now = Date.now }) {
    this.provider = provider
    this.communityCalls = communityCalls
    this.sharedHourlyLimit = sharedHourlyLimit
    this.config = { ...defaults, ...config }
    this.log = log
    this.now = now
    this.cache = new Map()
    this.usage = new Map()
    this.active = new Set()
    this.globalCalls = []
  }

  hourlyCalls(now = this.now()) {
    this.globalCalls = this.globalCalls.filter(time => time > now - 3600000)
    return this.globalCalls.length
  }

  reserve(userId) {
    const now = this.now()
    const hour = this.hourlyCalls(now)
    const calls = (this.usage.get(userId) || []).filter(time => time > now - 86400000)
    if (this.active.has(userId) || this.active.size >= this.config.concurrency) fail(429, 'assistant_busy', '小黄正在回答，请等一下再试。')
    if (calls.length >= this.config.perDay || calls.filter(time => time > now - 60000).length >= this.config.perMinute ||
        hour >= this.config.globalPerHour || hour + this.communityCalls() >= this.sharedHourlyLimit) {
      fail(429, 'assistant_rate_limit', '聊天次数已达上限，请稍后再试。')
    }
    this.active.add(userId)
    this.usage.set(userId, calls.concat(now))
    this.globalCalls.push(now)
  }

  chat(userId, body, signal) {
    const input = validate(body)
    if (signal.aborted) fail(409, 'assistant_cancelled', '这次回答已取消。')
    const key = userId + ':' + input.requestId
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex')
    let entry = this.cache.get(key)
    if (entry && entry.fingerprint !== fingerprint) fail(409, 'request_conflict', '请求标识已被另一条消息使用。')
    if (!entry) {
      if (this.cache.size >= this.config.cacheSize) fail(429, 'assistant_busy', '小黄暂时较忙，请稍后重试。')
      const result = search(input.message, input.history)
      const blocked = privateRequest.test(input.message)
      if (!result.answer && !blocked && this.provider.mode === 'real') this.reserve(userId)
      const controller = new AbortController()
      entry = { fingerprint, controller, settled: false, waiters: 0 }
      entry.result = Promise.resolve().then(async () => {
        const answer = blocked ? {
          reply: '我无法提供系统配置、凭证或他人的记录。你可以问我小程序怎么用。',
          actionIds: [], followUpIds: ['first_visit'], sourceType: 'guide'
        } : result.answer || await this.generate(input, result.entries, controller.signal)
        return { ...answer, requestId: input.requestId, knowledgeVersion, refreshKnowledge: input.knowledgeVersion !== knowledgeVersion }
      }).finally(() => {
        if (!result.answer && !blocked && this.provider.mode === 'real') this.active.delete(userId)
        entry.settled = true
        setTimeout(() => this.cache.delete(key), this.config.resultTtlMs).unref()
      })
      this.cache.set(key, entry)
    }
    return this.wait(entry, signal)
  }

  wait(entry, signal) {
    entry.waiters++
    return new Promise((resolve, reject) => {
      const cancel = () => {
        entry.waiters--
        if (!entry.settled && entry.waiters === 0) entry.controller.abort(new Error('assistant_cancelled'))
        reject(signal.reason)
      }
      signal.addEventListener('abort', cancel, { once: true })
      const finish = callback => value => {
        if (signal.aborted) return
        signal.removeEventListener('abort', cancel)
        entry.waiters--
        callback(value)
      }
      entry.result.then(finish(resolve), finish(reject))
    })
  }

  async generate(input, entries, signal) {
    const allowed = [...new Set(entries.flatMap(entry => entry.actionIds))]
    if (this.provider.mode === 'mock') {
      return {
        reply: '这是一条本地演示回复，用来检查消息、取消和重试流程。启用真实 AI 服务后，小黄才能回答这类问题。',
        actionIds: [], followUpIds: [], sourceType: 'mock'
      }
    }
    const started = Date.now()
    const request = createHash('sha256').update(input.requestId).digest('hex').slice(0, 16)
    const timeout = new AbortController()
    const timer = setTimeout(() => timeout.abort(new Error('provider_timeout')), this.config.timeoutMs)
    const combined = AbortSignal.any([signal, timeout.signal])
    const aborted = new Promise((_, reject) => {
      if (combined.aborted) reject(combined.reason)
      else combined.addEventListener('abort', () => reject(combined.reason), { once: true })
    })
    try {
      const raw = await Promise.race([aborted, Promise.resolve().then(() => {
        combined.throwIfAborted()
        return this.provider.generateAssistantReply(providerMessages(input, entries, allowed), { signal: combined })
      })])
      const reply = checkedReply(raw.output, allowed)
      if (entries.some(entry => entry.status === 'demo') &&
          /识别|人工确认/.test(reply.reply) && !/模拟|演示/.test(reply.reply)) {
        reply.reply = '目前「识别」展示模拟结果，请人工确认物种。\n\n' + reply.reply
        if (reply.reply.length > limits.reply) throw new Error('provider_invalid_json')
      }
      const usage = Object.fromEntries(['prompt_tokens', 'completion_tokens', 'total_tokens']
        .filter(key => Number.isSafeInteger(raw.usage?.[key]) && raw.usage[key] >= 0).map(key => [key, raw.usage[key]]))
      this.log?.({ request, latencyMs: Date.now() - started, usage })
      return { ...reply, sourceType: 'ai' }
    } catch (error) {
      const code = combined.reason?.message || error?.message
      const category = Object.hasOwn(userErrors, code) ? code : 'provider_network'
      this.log?.({ request, latencyMs: Date.now() - started, error: category })
      const [status, message] = userErrors[category]
      fail(status, category, message)
    } finally { clearTimeout(timer) }
  }
}

module.exports = { Assistant, validate, checkedReply }
