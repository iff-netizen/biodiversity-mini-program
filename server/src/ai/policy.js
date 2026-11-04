'use strict'
const { unsafeInput, normalText } = require('./safety')

function probability(content, kind, config, relatedHot = false) {
  if (kind === 'followup') return config.directReplyProbability
  // Mentions are removed before every feature calculation.
  const text = normalText(content)
  const adjustment = relatedHot && text.length >= 8 ? 0.04 : 0
  return Math.max(config.postMinProbability, Math.min(config.postMaxProbability, config.postBaseProbability + adjustment))
}
function eligibility({ post, enabled, config, kind, stats, now, forceTest = false }) {
  if (!config.enabled) return 'disabled_global'
  if (post.status !== 'active' || post.visibility !== 'public') return 'not_public'
  if (!enabled) return 'disabled_user'
  if (unsafeInput(post.content)) return 'unsafe_content'
  if (normalText(post.content).length < 2) return 'insufficient_context'
  if (stats.kindCount >= (kind === 'initial' ? config.maxInitialCommentsPerPost : config.maxFollowupCommentsPerPost)) return 'post_limit'
  if (stats.dayCount >= config.maxAICommentsPerUserPerDay) return 'user_daily_limit'
  if (stats.hourCount >= config.maxAICommentsGlobalPerHour) return 'global_hourly_limit'
  const cooldown = kind === 'initial' ? config.authorInitialCooldownMinutes * 60000 : config.followupCooldownSeconds * 1000
  // Only namespaced, explicitly forced development fixtures bypass cooldown.
  if (!forceTest && stats.lastAt != null && now - stats.lastAt < cooldown) return 'cooldown'
  return null
}
function chooseStyle(content, hasMemory, hasFacts, random) {
  if (/受伤|死亡|流血/.test(content)) return 'warm'
  if (/危险|投喂|捕捉|追上|追着|抓回|抓住|喂/.test(content)) return hasFacts ? 'science' : 'warm'
  if (/失落|难过|累|没拍到|空手/.test(content)) return 'warm'
  const scienceFits = hasFacts && /科普|为什么|怎么|知识|介绍|安全吗/.test(content)
  const styles = [['playful', 35], ['warm', 25], ...(scienceFits ? [['science', 20]] : []), ...(hasMemory ? [['community', 20]] : [])]
  let roll = random * styles.reduce((n, [, w]) => n + w, 0)
  for (const [style, weight] of styles) { roll -= weight; if (roll < 0) return style }
  return 'warm'
}
module.exports = { probability, eligibility, chooseStyle }
