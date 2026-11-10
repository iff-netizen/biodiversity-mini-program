const { actions, catalog, guide, knowledgeVersion } = require('./catalog')

const simplify = value => value.toLowerCase().replace(/[\s，。！？、,.!?「」“”]/g, '')
const appTerms = /小程序|共栖智护|底部|按钮|页面|入口|悬浮球|公开发布|社区互动|本机观察|地图|广场|图鉴|识别|小黄/
const operations = /哪里|在哪|怎么|如何|能否|可以|有没有|想|失败|找不到|没有|没法|打开|进入|关闭|切到/
const compound = /[，；。].*(?:然后|同时|顺便|另外|还想|还要|又想|如果|但是)|(?:能不能|如何|怎么).{0,30}(?:同时|并且|后再|然后|以及)/
const referential = /^(?:那|它|那里|这个|这样|然后|如果|为什么|接下来|在哪|在哪里|找不到|失败了)/

function score(entry, query) {
  const normalized = simplify(query)
  if ([entry.title, ...entry.aliases].some(alias => simplify(alias) === normalized)) return 100
  return entry.keywords.reduce((total, keyword) => total + (keyword.test(normalized) ? 4 : 0), 0)
}

function search(message, history = []) {
  const explicit = Object.entries(actions).find(([, action]) => {
    const name = '[「“]?' + action.name + '(?:页|页面)?[」”]?'
    const open = '(?:请|能不能|可以)?(?:帮我|带我|我要|我想)?(?:打开|去|进入|切到|跳到)(?:底部的?|小程序的?)?' + name + '(?:吧|吗)?'
    const find = '(?:我?找不到' + name + '|' + name + '(?:在)?(?:哪里|哪儿|哪))'
    return new RegExp('^(?:' + open + '|' + find + ')[。！!？?]?$').test(message.trim())
  })
  if (explicit) {
    const [id, action] = explicit
    return { answer: { reply: '可以，点下面的按钮就能到「' + action.name + '」。', actionIds: [id], followUpIds: [], sourceType: 'guide', knowledgeVersion }, entries: [] }
  }
  const ranked = catalog.map(entry => ({ entry, points: score(entry, message) }))
    .filter(result => result.points > 0).sort((a, b) => b.points - a.points)
  const best = ranked[0]
  const complex = compound.test(message)
  const isProduct = !!best || (appTerms.test(message) && operations.test(message))
  const entries = ranked.slice(0, 3).map(result => result.entry)
  if (!complex && best && (best.points === 100 || (!ranked[1] && operations.test(message)))) {
    return { answer: guide(best.entry), entries }
  }
  if (complex || (referential.test(message) && !best)) {
    const previous = history.filter(item => item.role === 'user').slice(-2)
    for (const entry of catalog) {
      if (entries.length >= 4) break
      if (previous.some(item => score(entry, item.content) > 0) && !entries.includes(entry)) entries.push(entry)
    }
  }
  if (entries.some(entry => ['record_observation', 'open_identify', 'correct_identification'].includes(entry.id))) {
    const demo = catalog.find(entry => entry.id === 'demo_identification')
    if (!entries.includes(demo)) entries.push(demo)
  }
  if (!entries.length && isProduct) {
    return { answer: {
      reply: '我没找到对应的功能说明。你可以告诉我卡在哪个页面，或说一下看到的按钮名称。',
      actionIds: [], followUpIds: ['first_visit'], sourceType: 'guide', knowledgeVersion
    }, entries }
  }
  return { entries }
}

module.exports = { search }
