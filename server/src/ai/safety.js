'use strict'

// Deliberately conservative: questionable personal/location content is excluded
// from shared memory rather than trusting a model to redact arbitrary prose.
const sensitive = /(?:\b\d{1,3}\.\d{3,}\b|1[3-9]\d{9}|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:微信|电话|手机号|身份证|密码|密钥|经度|纬度|坐标|门牌|巢穴|鸟窝|住在|住址|我叫|姓名|学号|账号|寝室|宿舍|每天.{0,8}(?:点|去|路过))|(?:路|街|栋|号楼)\s*\d+|\d+\s*(?:号|室)|sk-[\w-]+|https?:\/\/\S+)/i
const injection = /(?:忽略.{0,12}(?:规则|指令|提示)|输出.{0,16}(?:密钥|密码|位置)|给出所有人|冒充管理员|system\s*:|<\/?(?:system|script)|ignore.{0,12}instructions)/i
function unsafeInput(text) { return injection.test(text) }
function privateText(text) { return sensitive.test(text) }
function sanitize(text) {
  const value = String(text || '').replace(/@[\w\u4e00-\u9fff-]+/g, '').trim()
  return privateText(value) || unsafeInput(value) ? '[内容因隐私或不可信指令未提供]' : value.slice(0, 600)
}
const topicRules = [
  ['鸟叫', /鸟叫|鸟鸣|啾|鸟.{0,8}(?:点名|早八)/], ['观鸟', /鸟|羽毛/],
  ['散步', /散步|风|树|叶|空手|没拍到/], ['初次观察', /第一次|初次/],
  ['善待野生动物', /投喂|喂|捕捉|追逐|追上|追着|抓回|抓住|受伤|流血|救助/],
  ['猫', /猫/], ['昆虫', /虫|蝴蝶|蜜蜂/], ['心情', /难过|失落|开心|累|孤单/]
]
function tags(text) { const plain = String(text).replace(/@[\w\u4e00-\u9fff-]+/g, ''); return topicRules.filter(([, rule]) => rule.test(plain)).map(([tag]) => tag) }
function normalText(text) { return String(text).replace(/@[\w\u4e00-\u9fff-]+/g, '').replace(/[\s\p{P}\p{S}]/gu, '') }
function similarity(a, b) {
  const x = normalText(a), y = normalText(b)
  if (x === y) return 1
  const grams = t => new Set(Array.from({ length: Math.max(0, t.length - 1) }, (_, i) => t.slice(i, i + 2)))
  const left = grams(x), right = grams(y)
  if (!left.size || !right.size) return 0
  return 2 * [...left].filter(g => right.has(g)).length / (left.size + right.size)
}
module.exports = { unsafeInput, privateText, sanitize, tags, normalText, similarity }
