'use strict'
const { tags } = require('./safety')
// Labels for matching user narratives only; these names are not identifications.
const names = ['小灵猫', '豹猫', '夜鹭', '白鹭', '麻雀', '喜鹊', '斑鸠', '蝴蝶', '蜜蜂']
function speciesLabels(text) { const plain = text.replace(/@[\w\u4e00-\u9fff-]+/g, ''); return names.filter(name => plain.includes(name)) }
function relevantMemory(text, summary, explicitSpecies = '') {
  const a = speciesLabels(text + explicitSpecies), b = speciesLabels(summary)
  if (a.length && b.length && !a.some(name => b.includes(name))) return false
  if (a.some(name => b.includes(name))) return true
  const common = tags(text).filter(tag => tags(summary).includes(tag))
  if (common.some(tag => ['鸟叫', '善待野生动物', '猫', '昆虫'].includes(tag))) return true
  const details = ['散步', '风', '树叶', '叶子', '树影', '阳光', '草地', '羽毛', '望远镜']
  return common.length > 0 && details.some(word => text.includes(word) && summary.includes(word))
}
module.exports = { relevantMemory, speciesLabels }
