'use strict'

const defaults = Object.freeze({
  version: 'policy-2', enabled: true, botName: '小黄',
  postBaseProbability: 0.80, postMinProbability: 0.20, postMaxProbability: 0.80,
  directReplyProbability: 0.60, delaySecondsMin: 8, delaySecondsMax: 45,
  maxInitialCommentsPerPost: 1, maxFollowupCommentsPerPost: 1,
  authorInitialCooldownMinutes: 15, followupCooldownSeconds: 30,
  maxAICommentsPerUserPerDay: 6, maxAICommentsGlobalPerHour: 60,
  maxProviderCallsGlobalPerHour: 90, jobExpiresAfterHours: 6,
  maxProviderAttemptsPerJob: 2, memoryDays: 14,
  leaseMs: 60000, providerTimeoutMs: 15000
})

function seededRandom(seed) {
  let value = Number(seed) >>> 0
  return () => { value = (1664525 * value + 1013904223) >>> 0; return value / 4294967296 }
}
function environment(env = process.env) {
  const mode = env.APP_MODE || 'development'
  const provider = env.AI_PROVIDER || 'mock'
  if (!['mock', 'real'].includes(provider)) throw new Error('AI_PROVIDER must be mock or real')
  const timeout = Number(env.AI_TIMEOUT_MS || defaults.providerTimeoutMs)
  if (!Number.isFinite(timeout) || timeout < 50 || timeout > 45000) throw new Error('AI_TIMEOUT_MS outside 50..45000')
  return {
    mode, provider, host: env.HOST || '127.0.0.1', port: Number(env.PORT || 8787),
    devControls: mode === 'development' && env.DEV_CONTROLS === 'true',
    policy: { ...defaults, enabled: env.AI_ENABLED !== 'false', providerTimeoutMs: timeout },
    rng: mode === 'development' && env.DEV_RANDOM_SEED ? seededRandom(env.DEV_RANDOM_SEED) : Math.random
  }
}
module.exports = { defaults, environment, seededRandom }
