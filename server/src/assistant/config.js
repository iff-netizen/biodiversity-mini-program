'use strict'

const defaults = Object.freeze({
  timeoutMs: 25000, perMinute: 10, perDay: 100, globalPerHour: 30, concurrency: 2,
  resultTtlMs: 60000, cacheSize: 256
})

function assistantConfig(env) {
  const variables = {
    timeoutMs: ['ASSISTANT_TIMEOUT_MS', 50, 30000],
    perMinute: ['ASSISTANT_PER_MINUTE', 1, 100],
    perDay: ['ASSISTANT_PER_DAY', 1, 1000],
    globalPerHour: ['ASSISTANT_GLOBAL_PER_HOUR', 1, 1000],
    concurrency: ['ASSISTANT_CONCURRENCY', 1, 8]
  }
  return Object.fromEntries(Object.entries(variables).map(([key, [name, min, max]]) => {
    const value = Number(env[name] || defaults[key])
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(name + ' outside ' + min + '..' + max)
    return [key, value]
  }))
}

module.exports = { defaults, assistantConfig }
