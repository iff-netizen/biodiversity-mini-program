'use strict'
const { normalText, similarity } = require('./safety')
function withoutQuotes(text) { return String(text).replace(/[“「『"][^”」』"]*[”」』"]/gu, '') }
function longestSharedRun(a, b) {
  let row = new Uint16Array(b.length + 1), longest = 0
  for (let i = 0; i < a.length; i++) {
    const next = new Uint16Array(b.length + 1)
    for (let j = 0; j < b.length; j++) if (a[i] === b[j]) { next[j + 1] = row[j] + 1; longest = Math.max(longest, next[j + 1]) }
    row = next
  }
  return longest
}
function repetition(text, previous) {
  if (similarity(text, previous) >= 0.78) return true
  const a = normalText(withoutQuotes(text)), b = normalText(withoutQuotes(previous))
  if (a.length < 12 || b.length < 12) return false
  const shared = longestSharedRun(a, b)
  // Catch repeated endings even when each comment embeds a different post.
  return shared >= 12 && (shared / Math.min(a.length, b.length) >= 0.55 || shared >= 22)
}
function qualityIssue(text, context) {
  if (/自然日记多了一格|小小的发现也值得占个位置|今天的观察日记又多了一行/.test(text)) return 'canned_response'
  const source = context.currentPost?.content || ''
  const quotes = [...text.matchAll(/[“「『"]([^”」』"]{12,})[”」』"]/gu)].map(m => m[1])
  if (quotes.some(q => source.startsWith(q) && source.length > q.length && !/[。！？!?]$/.test(q))) return 'truncated_echo'
  if (quotes.some(q => source.includes(q) && q.length > [...text].length * 0.55)) return 'post_echo'
  if ((context.recentBotComments || []).some(old => repetition(text, old))) return 'near_duplicate'
  return null
}
module.exports = { qualityIssue, repetition }
