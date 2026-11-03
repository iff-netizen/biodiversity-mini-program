'use strict'
const { privateText, unsafeInput } = require('./safety')
const { qualityIssue } = require('./quality')
function validateOutput(raw, context) {
  let result
  try { result = typeof raw === 'string' ? JSON.parse(raw) : raw } catch { throw new Error('invalid_json') }
  const keys = ['action', 'text', 'style', 'usedMemoryIds', 'usedFactIds', 'reasonCode']
  if (!result || Array.isArray(result) || Object.keys(result).length !== keys.length || keys.some(k => !Object.hasOwn(result, k)) ||
    !['comment', 'skip'].includes(result.action) || typeof result.text !== 'string' ||
    !['playful', 'warm', 'science', 'community'].includes(result.style) ||
    !['ok', 'insufficient_context', 'unsuitable'].includes(result.reasonCode) ||
    !Array.isArray(result.usedMemoryIds) || !Array.isArray(result.usedFactIds) || result.usedMemoryIds.length > 4 || result.usedFactIds.length > 2) throw new Error('invalid_schema')
  if (result.usedMemoryIds.some(id => typeof id !== 'string' || !context.communityMemories.some(m => m.id === id)) ||
    result.usedFactIds.some(id => typeof id !== 'string' || !context.verifiedFacts.some(f => f.id === id))) throw new Error('forged_source')
  if (result.action === 'skip') {
    if (result.text !== '' || result.usedMemoryIds.length || result.usedFactIds.length || result.reasonCode === 'ok') throw new Error('invalid_skip')
    return result
  }
  const text = result.text.trim()
  if (!text || [...text].length > 120 || result.reasonCode !== 'ok') throw new Error('invalid_length')
  // Mentioning coordinates while refusing to disclose them is not a leak.
  // Coordinate values and actual assignments remain subject to the privacy gate.
  const privacyText = text.replace(/坐标(?!\s*(?:为|是|[:：=])?\s*[+-]?\d)/g, '定位信息')
  if (privateText(privacyText) || unsafeInput(text) || /我(?:刚刚|刚才|也去|亲眼)|我(?:也|今天|当时)?(?:去过|看见了|看到了|拍到了)|我(?:看见|看到)照片|我是(?:真人|管理员|专家)|<(?:script|img)|(?:建议|可以|快去|试试).{0,5}(?:投喂|捕捉|追逐)/i.test(text)) throw new Error('unsafe_output')
  if ((text.match(/\p{Extended_Pictographic}/gu) || []).length > 2) throw new Error('too_many_emoji')
  if (context.currentPost?.speciesStatus !== 'expert_verified' && /(?:就是|肯定是|一定是|确认为)(?:一只|这只|那只)?(?:豹猫|小灵猫|[\u4e00-\u9fff]{1,4}科)/.test(text)) throw new Error('unverified_science')
  const used = context.communityMemories.filter(m => result.usedMemoryIds.includes(m.id))
  if (/(?:大家|几位(?:朋友|用户|同学)?|很多人|不少人).{0,8}(?:聊|提到|说过|见过|发现|听到|都遇)/.test(text) && !used.some(m => m.independentAuthors >= 2)) throw new Error('unproven_consensus')
  if (/有人提|广场.{0,8}(?:说|聊|提)|之前.{0,8}(?:说|聊|提)/.test(text) && !used.length) throw new Error('unproven_memory')
  if (result.style === 'science') {
    const cited = context.verifiedFacts.filter(f => result.usedFactIds.includes(f.id))
    // Human-checked paraphrases allow concise conversation without arbitrary claims.
    if (!cited.length || !cited.some(f => [f.text, ...(f.approvedTexts || [])].includes(text))) throw new Error('unverified_science')
  } else if (/保护动物|保护等级|国家[一二]级|濒危|分布于|学名|繁殖|习性|疾病|治疗|有毒|无毒|属于.{0,8}科/.test(text)) throw new Error('unverified_science')
  const issue = qualityIssue(text, context)
  if (issue) throw new Error(issue)
  result.text = text
  return result
}
module.exports = { validateOutput }
