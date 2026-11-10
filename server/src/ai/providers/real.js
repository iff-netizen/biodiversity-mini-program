'use strict'
const { systemPrompt } = require('../promptBuilder')
class RealProvider {
  constructor(env = process.env, fetcher = fetch) {
    this.mode = 'real'; this.model = env.AI_MODEL || ''
    this.vendor = env.AI_VENDOR || (env.AI_BASE_URL && new URL(env.AI_BASE_URL).hostname === 'api.deepseek.com' ? 'deepseek' : 'openai')
    if (!['openai', 'deepseek'].includes(this.vendor)) throw new Error('AI_VENDOR must be openai or deepseek')
    this.baseUrl = (env.AI_BASE_URL || (this.vendor === 'deepseek' ? 'https://api.deepseek.com' : 'https://api.openai.com/v1')).replace(/\/$/, '')
    this.key = env.AI_API_KEY || ''; this.fetcher = fetcher
    const parsed = new URL(this.baseUrl)
    if (parsed.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) throw new Error('Real provider requires HTTPS')
  }
  status() { return { code: this.billingBlocked ? 'insufficient_balance' : this.verified ? 'ready' : this.key && this.model ? 'configured_unverified' : 'missing_credentials', configured: !!(this.key && this.model), vendor: this.vendor, model: this.model || null } }
  async generateComment(context, { signal } = {}) {
    return this.complete([
      { role: 'system', content: systemPrompt }, { role: 'user', content: JSON.stringify({ type: 'untrusted_community_data', ...context }) }
    ], 800, signal)
  }
  generateAssistantReply(messages, { signal } = {}) { return this.complete(messages, 1000, signal) }
  async complete(messages, maxTokens, signal) {
    if (!this.key || !this.model) throw new Error('missing_credentials')
    if (this.billingBlocked) throw new Error('provider_insufficient_balance')
    const body = { model: this.model, messages, response_format: { type: 'json_object' }, stream: false,
      ...(this.vendor === 'deepseek' ? { max_tokens: maxTokens, thinking: { type: 'disabled' } } : { max_completion_tokens: maxTokens }) }
    const response = await this.fetcher(this.baseUrl + '/chat/completions', {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + this.key },
      body: JSON.stringify(body)
    })
    if (response.status === 402) { this.billingBlocked = true; throw new Error('provider_insufficient_balance') }
    if (!response.ok) throw new Error(response.status === 429 ? 'provider_429' : 'provider_http_' + response.status)
    let data
    try { data = await response.json() } catch { throw new Error('provider_invalid_json') }
    const choice = data?.choices?.[0]
    if (choice?.message?.refusal || choice?.finish_reason === 'content_filter') throw new Error('provider_refusal')
    if (choice?.finish_reason === 'length') throw new Error('provider_truncated')
    const output = choice?.message?.content
    if (typeof output !== 'string' || !output.trim()) throw new Error('provider_empty')
    this.verified = true
    return { output, usage: data.usage || null }
  }
}
module.exports = { RealProvider }
