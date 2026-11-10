const knowledgeVersion = 'assistant-help-v1'
const checkedAt = '2026-11-10'
const assistantName = '小黄'
const limits = Object.freeze({ message: 1000, reply: 2000, history: 12, historyChars: 6000, bodyBytes: 48000, sessions: 10, messages: 100, days: 7 })
const actions = Object.freeze({
  open_map: { pageId: 'map', label: '去地图', name: '地图' },
  open_discover: { pageId: 'discover', label: '去发现', name: '发现' },
  open_identify: { pageId: 'identify', label: '去识别页', name: '识别' },
  open_collection: { pageId: 'collection', label: '去图鉴', name: '图鉴' },
  open_profile: { pageId: 'profile', label: '去我的', name: '我的' }
})
const pageIds = Object.values(actions).map(action => action.pageId)
const groups = ['怎么用', '自然小知识', '随便聊聊']

function help(id, title, aliases, keywords, status, summary, steps, prerequisites, limitations, actionIds, relatedFaqIds, codeRefs) {
  return { id, title, aliases, keywords, category: groups[0], status, summary, steps, prerequisites, limitations, actionIds, relatedFaqIds, knowledgeVersion, checkedAt, codeRefs }
}

const catalog = [
  help('first_visit', '我是第一次来，应该从哪里开始？', ['新手怎么用', '第一次来'], [/第一次[来用]|新手.*(入门|开始)/],
    'available', '可以先看看地图、试一次观察记录，或浏览其他人在发现广场分享的动态。',
    ['从底部「地图」查看有位置的本机观察。', '从「识别」试着选图、人工确认物种并保存。', '从「发现」进入「广场」。'], '', '识别目前为模拟。',
    ['open_map', 'open_identify', 'open_discover'], ['record_observation', 'publish_post'], ['app.json', 'pages/map/map.js', 'pages/identify/identify.wxml', 'pages/discover/discover.wxml']),
  help('record_observation', '怎么记录一次自然观察？', ['我想记录一种看到的小动物，怎么弄', '怎么保存观察'], [/(?:怎么|如何|想|去哪里).{0,10}(?:记录|保存).{0,10}(?:观察|动物|发现)/, /(?:记录|保存).{0,10}(?:观察|动物).{0,10}(?:怎么|如何|在哪)/],
    'demo', '从底部「识别」开始。当前识别结果是模拟的，请自己确认物种。',
    ['点「拍照或上传图片」，再点「开始识别」。', '确认结果，或点「识别不准确」并选择实际观察到的物种。', '点「保存观察记录」。保存后可选择是否去分享。'], '保存需要选择图片并成功获取定位。', '若提示「无法获取位置」，此次不会保存。保存的是本机观察，分享需要另行确认。',
    ['open_identify'], ['correct_identification', 'share_observation'], ['pages/identify/identify.wxml', 'pages/identify/identify.js']),
  help('open_identify', '拍照识别在哪里？', ['打开识别', '识别入口', '哪里拍照识别'], [/(?:拍照|图片|选图).{0,8}识别|识别.{0,6}(?:在哪|入口)/],
    'demo', '打开底部「识别」，点「拍照或上传图片」，再点「开始识别」。', [], '', '这里展示的是模拟结果，请在保存前人工确认。',
    ['open_identify'], ['correct_identification', 'demo_identification'], ['pages/identify/identify.wxml', 'pages/identify/identify.js']),
  help('correct_identification', '识别错了怎么改？', ['如果识别错了呢', '纠正识别结果', '识别不准确'], [/(?:识别|结果).{0,8}(?:不准|错了|错误|纠正|怎么改)|(?:改|纠正).{0,8}(?:识别|物种)/],
    'demo', '看到模拟结果后，可以手动选定观察到的物种。', ['点「识别不准确」，在列表选实际观察到的物种。', '若已确认，点「修改物种」再选。', '核对后点「保存观察记录」。'], '', '请以自己的观察为准。',
    ['open_identify'], ['demo_identification', 'record_observation'], ['pages/identify/identify.wxml']),
  help('demo_identification', '这个识别结果是真的吗？', ['豹猫是真的吗', '识别准确吗', '96%可信吗'], [/(?:识别|豹猫|96%).{0,10}(?:真的|可信|准确吗|模拟|准确率)/],
    'demo', '当前页面固定展示模拟的豹猫结果。显示的 96% 是演示值，不能用来鉴定照片里的动物。',
    ['可以点「识别不准确」，按你的实际观察选择物种。'], '', '聊天页也不接收或识别照片。',
    ['open_identify'], ['correct_identification'], ['pages/identify/identify.js', 'pages/identify/identify.wxml']),
  help('publish_post', '怎样在发现里发布动态？', ['怎么发帖', '公开发布在哪里'], [/(?:发布|发|写).{0,5}(?:动态|帖子)|发帖|(?:广场|动态).{0,7}公开发布/],
    'available', '在「发现」的「广场」可以发纯文字动态。',
    ['打开底部「发现」，选择「广场」。', '输入正文，核对后点「公开发布」。'], '需要连上社区服务。', '广场动态是公开内容，也可能用于社区 AI 互动。',
    ['open_discover'], ['share_observation', 'disable_community_ai'], ['pages/discover/discover.wxml', 'pages/discover/discover.js']),
  help('share_observation', '保存观察后怎么分享到广场？', ['分享观察记录', '本机观察怎么公开'], [/(?:观察|记录).{0,14}(?:分享|公开)|(?:分享|公开).{0,7}(?:观察|记录)/],
    'available', '本机观察要由你确认后才会公开。分享只带文字和用户确认的物种。',
    ['刚保存时，在提示中选择「去分享」。', '已有记录可在观察详情，或「发现」的「本机观察」找到「补充文字并分享到发现」。', '修改文字后点「公开发布」。'], '已有本机观察，发布时需连接社区服务。', '照片与精确位置留在本机。',
    ['open_discover', 'open_profile'], ['publish_post', 'past_observations'], ['pages/identify/identify.js', 'pages/observation/observation.wxml', 'pages/discover/discover.wxml']),
  help('empty_map', '为什么地图上没有记录？', ['地图找不到记录', '地图上没有标记'], [/(?:地图|标记).{0,12}(?:没有|没看到|不显示|找不到|空白)|(?:没有|找不到).{0,8}(?:地图记录|地图标记)/],
    'available', '地图标记来自本机有经纬度的观察。可以先检查记录是否已保存，以及该记录是否有位置。', ['在「我的」查看「最近观察」，点开对应记录查看位置。'], '', '地图不提供附近野生动物的实时分布。',
    ['open_map', 'open_profile'], ['past_observations', 'live_animals'], ['pages/map/map.js', 'pages/profile/profile.wxml']),
  help('unlock_collection', '我的图鉴为什么没有解锁？', ['图鉴解锁失败', '怎么解锁物种'], [/(?:图鉴|物种).{0,12}(?:解锁|找不到)|(?:解锁|找不到).{0,8}(?:图鉴|物种)/],
    'available', '图鉴按本机观察中已收录的物种解锁。', ['先确认观察已保存。', '在「最近观察」核对物种，再回「图鉴」查看。'], '', '发帖和点赞不会解锁物种。',
    ['open_collection', 'open_profile'], ['record_observation'], ['pages/collection/collection.js', 'pages/profile/profile.wxml']),
  help('past_observations', '从哪里看我以前的观察？', ['我的观察记录在哪里', '怎么找以前的观察'], [/(?:以前|过去|历史|我的|最近).{0,8}(?:观察|记录)|(?:哪里|哪儿|怎么).{0,6}(?:看|找).{0,6}(?:观察|记录)/],
    'available', '「我的」页面有「最近观察」，会显示最近 5 条。', ['点任一记录进入详情。', '还可到「发现」选择「本机观察」。'], '', '这些记录保存在当前设备。',
    ['open_profile', 'open_discover'], ['delete_observation', 'share_observation'], ['pages/profile/profile.js', 'pages/profile/profile.wxml', 'pages/discover/discover.wxml']),
  help('delete_observation', '怎么删除一条观察记录？', ['删除本次观察', '可以自动替我删除所有观察吗'], [/(?:删除|移除|清除).{0,10}(?:观察|记录)|(?:观察|记录).{0,8}(?:删除|移除)/],
    'available', '请打开要删除的单条观察详情，由你亲自确认。', ['从「我的」的「最近观察」进入该条详情，或在地图点标记后查看本次观察。', '点「删除本次观察」，阅读提示后确认。'], '', '助手无法代删，也没有一键删除全部观察的入口。若有已关联的公开动态，删除需要社区服务可用。',
    ['open_profile', 'open_map'], ['past_observations'], ['pages/observation/observation.js', 'pages/observation/observation.wxml', 'pages/map/map.wxml']),
  help('disable_community_ai', '怎么关闭小黄在广场的评论？', ['关闭社区ai', '不想接收广场ai评论'], [/(?:关闭|关掉|停用|不想接收).{0,16}(?:广场|社区|评论|互动)|(?:广场|社区).{0,10}(?:关闭|关掉)/],
    'available', '在「我的」找到「社区互动」，关闭「接收小黄的 AI 互动」。', [], '设置保存需要连接社区服务。', '你仍可主动打开助手聊天。',
    ['open_profile'], ['hide_fab'], ['pages/profile/profile.wxml', 'pages/profile/profile.js']),
  help('hide_fab', '怎么隐藏首页的小黄？', ['关闭悬浮球', '显示首页助手', '首页小黄找不到'], [/(?:隐藏|显示|关闭|打开|找不到).{0,12}(?:首页.{0,5}(?:小黄|助手)|悬浮球)|(?:首页.{0,5}(?:小黄|助手)|悬浮球).{0,8}(?:隐藏|关闭|找不到)/],
    'available', '在「我的」找到「AI 助手」，切换「显示首页助手」。', [], '', '关闭后仍能从「我的」点「打开 AI 助手」。',
    ['open_profile'], ['disable_community_ai'], ['pages/profile/profile.wxml', 'pages/map/map.wxml']),
  help('live_animals', '能看附近现在有哪些野生动物吗？', ['帮我查询附近现在全部的野生动物', '实时动物定位'], [/(?:实时|附近现在|现在附近).{0,12}(?:动物|分布|监测|定位)|附近.{0,15}全部.{0,5}动物/],
    'unavailable', '目前无法查询附近动物的实时分布。「地图」只会显示本机已保存且带位置的观察。', [], '', '',
    ['open_map'], ['empty_map'], ['pages/map/map.js']),
  help('no_extra_features', '能语音聊天或同步历史吗？', ['云同步聊天', '怎么用语音聊天', '助手里上传照片识别'], [/语音(?:聊天|输入)|聊天.{0,8}(?:传图|上传照片|同步)|跨设备.{0,6}同步|助手.{0,10}(?:联网|语音|传图|上传照片)/],
    'unavailable', '目前助手支持文字聊天，记录保存在本机。语音、聊天传图、联网查询和跨设备聊天同步暂未提供。', [], '', '',
    [], ['open_identify'], ['pages/assistant/assistant.wxml', 'utils/assistant-storage.js'])
]

const prompts = [
  ['feed_wildlife', 1, '为什么不要给野生动物投喂？'],
  ['watch_birds', 1, '观察小鸟时怎样不打扰它？'],
  ['what_biodiversity', 1, '生物多样性和我有什么关系？'],
  ['dusk_activity', 1, '为什么傍晚有些动物更活跃？'],
  ['nature_fact', 2, '给我讲一个有趣的自然小知识'],
  ['no_photo', 2, '我今天什么都没拍到'],
  ['tired_today', 2, '今天有点累，陪我聊聊'],
  ['campus_task', 2, '给我一个十分钟的校园观察小任务']
]
const faq = catalog.map(({ id, category, title }) => ({ id, category, title }))
  .concat(prompts.map(([id, group, title]) => ({ id, category: groups[group], title })))
const initialFaqIds = ['first_visit', 'record_observation', 'publish_post', 'feed_wildlife', 'watch_birds', 'tired_today']
const findHelp = id => catalog.find(entry => entry.id === id)
const findFaq = id => faq.find(entry => entry.id === id)
const findAction = id => Object.prototype.hasOwnProperty.call(actions, id) ? actions[id] : null

function guide(entry) {
  return {
    reply: [entry.summary, ...entry.steps.map((step, i) => (i + 1) + '. ' + step), entry.prerequisites, entry.limitations].filter(Boolean).join('\n\n'),
    actionIds: entry.actionIds.slice(0, 2), followUpIds: entry.relatedFaqIds.slice(0, 3), sourceType: 'guide', knowledgeVersion
  }
}

module.exports = { assistantName, knowledgeVersion, limits, actions, pageIds, groups, catalog, faq, initialFaqIds, findHelp, findFaq, findAction, guide }
