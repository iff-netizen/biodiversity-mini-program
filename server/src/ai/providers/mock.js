'use strict'
const { mockModel } = require('../versions')
const { qualityIssue } = require('../quality')
// Small, transparent functional fixtures. No runtime persona or free generation
// is claimed here. Unrecognized inputs skip instead of receiving a generic slogan.
class MockProvider {
  constructor() { this.mode = 'mock'; this.model = mockModel }
  async generateComment(context) {
    const post = context.currentPost.content
    const replyTarget = context.comments.find(c => c.id === context.replyToCommentId && c.authorType === 'human')
    const text = replyTarget ? replyTarget.content : post
    let reply, style = 'playful', usedMemoryIds = [], usedFactIds = []
    const skip = () => ({ action: 'skip', text: '', style: 'warm', usedMemoryIds: [], usedFactIds: [], reasonCode: 'insufficient_context' })
    if (/忽略|密钥|\[内容因/.test(text)) return skip()
    if (/受伤|流血|死去|死亡/.test(text)) {
      reply = /死去|死亡/.test(text) ? '看到这样的事，难过很正常。先别触碰它，把情况告诉当地相关工作人员吧。' : '先别急着碰它，留出距离，把情况告诉当地专业救助人员吧。'; style = 'warm'
    } else if (/投喂|喂|追上|追着|追逐|捕捉|抓回|抓住/.test(text)) {
      const id = /投喂|喂/.test(text) ? 'wildlife-no-feeding-v1' : 'wildlife-distance-v1'
      const fact = context.verifiedFacts.find(f => f.id === id)
      if (!fact) return skip()
      reply = fact.approvedTexts?.[0] || fact.text; style = 'science'; usedFactIds = [fact.id]
    } else if (/精确|点位|在哪|地址/.test(text)) {
      reply = '具体位置就先不公开啦，给小动物留一点不被打扰的空间。'; style = 'warm'
    } else if (/小灵猫|豹猫|是不是|不确定|像不像/.test(text)) {
      reply = /听|老师说|传闻/.test(text) ? '听说校园可能有这样的动物，难怪会惊喜！先把物种留作待确认，远远观察就好。' : '这个猜想挺让人好奇，不过单凭描述还不能确认物种。先远远观察，别追着它跑。'; style = 'warm'
    } else if (replyTarget) {
      if (/风|舒服|散步/.test(text)) reply = '那这趟散步就很值了，舒服的风也算今天的一份收获。'
      else if (/早读|广播|点名|笑/.test(text)) reply = '哈哈，校园的早间节目还挺热闹，听着都精神起来了。'
      else if (/谢谢|对呀|是的|确实/.test(text)) reply = '那就把这个小发现记下来吧，下次路过也许还会有新故事。'
      else return skip()
      style = 'warm'
    } else if (/鸟叫|鸟鸣|点名|早八/.test(text)) {
      const m = context.communityMemories.find(m => /鸟叫|鸟鸣|点名/.test(m.summary))
      if (m) {
        if (/点名/.test(text)) reply = '有人也在聊早晨鸟叫。你说像点名，一下就有画面了。'
        else if (/点名/.test(m.summary)) reply = /广播/.test(text) ? '广场里有人把鸟叫比作点名，你这边又像晨间广播，早上的节目还挺丰富。' : '之前有人把鸟叫比作点名，你这边又听到了，早起的动静还挺热闹。'
        else reply = '之前有人也提到清晨鸟叫，看来这份早起的热闹，你们都听到了。'
        style = 'community'; usedMemoryIds = [m.id]
      } else reply = /点名/.test(text) ? '这位点名员还挺认真，就是不知道它算不算迟到🌿' : '听到鸟叫就醒了，今天的闹钟有点特别呀。'
    } else if (/没拍到|空手|什么都没/.test(text)) {
      reply = /风/.test(text) ? '照片没拍到，舒服的风倒是接住了，也算有收获。' : '这回没拍到也没关系，走出去的这一趟已经算数啦。'; style = 'warm'
    } else if (/失落|难过|累|孤单/.test(text)) {
      reply = /累/.test(text) ? '忙了一天就先慢慢走吧，今天不用再给自己加观察任务了。' : '坐在树下发会儿呆也挺好，先让自己缓一缓。'; style = 'warm'
    } else if (/蜜蜂|嗡嗡/.test(text)) reply = '平时路过没留意，认真一听，花丛还挺热闹。'
    else if (/蝴蝶/.test(text)) reply = '它在花上停一会儿，你也跟着停一会儿，这个节奏挺好。'
    else if (/虫/.test(text)) reply = '认真看一眼，小虫子也成了今天值得记录的发现。'
    else if (/风|散步/.test(text)) reply = '风舒服的时候，脚步都舍不得走快了。'
    else if (/叶|树影/.test(text)) reply = '平时匆匆路过，今天倒是认真看见这片绿意了。'
    else if (/阳光/.test(text)) reply = '阳光好的时候，出门走走都像给今天加了一点亮度。'
    else if (/第一次|初次/.test(text)) reply = '第一次认真观察，熟悉的校园也开始有新发现了。'
    else return skip()
    if (qualityIssue(reply, context)) return skip()
    return { action: 'comment', text: reply, style, usedMemoryIds, usedFactIds, reasonCode: 'ok' }
  }
}
module.exports = { MockProvider }
