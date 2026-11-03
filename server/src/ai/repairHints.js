'use strict'
function repairHint(category) {
  if (!category) return null
  return {
    near_duplicate: '不要复用近期评论的开头、结尾或骨架；重新回应这次的具体细节。',
    canned_response: '不要使用通用日记口号；回应这次的具体细节。',
    truncated_echo: '不要截取帖子开头拼接结尾，不要长段照抄。',
    post_echo: '用自己的话接话，减少重复原文。',
    invalid_schema: '只返回六个键：action,text,style,usedMemoryIds,usedFactIds,reasonCode；不得添加type等字段。',
    unverified_science: '若是普通分享或玩笑，请自然接话而非插入科普。若选择science，text必须逐字等于当前verifiedFacts中的某一条text或approvedTexts，不能增删、改写、加前后缀。'
  }[category] || '上次未通过结构或来源校验，请按系统 JSON 结构和当前有效来源重新生成。'
}
module.exports = { repairHint }
