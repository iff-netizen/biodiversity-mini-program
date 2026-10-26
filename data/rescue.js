const rescueContacts = [
  {
    id: 'school-property',
    category: '校内事务联系',
    name: '物业管理处',
    phone: '0756-3620123',
    otherPhones: '',
    description:
      '学校物业联系渠道。动物相关情况的协调范围待确认，非专业动物救援热线。',
    serviceTime: '服务时间待确认',
    source: '学校通讯录（团队提供截图）',
    sourceUrl: '',
    verification: '动物相关受理范围尚未核实'
  },

  {
    id: 'school-medical',
    category: '人员医疗求助',
    name: '医疗及健康教育处',
    phone: '0756-3620555',
    otherPhones:
      '其他公开电话：0756-3620120；通讯录所列热线：13928025919',
    description:
      '用于人员医疗求助，不用于动物救治。具体接诊安排待确认。',
    serviceTime: '服务时间待确认',
    source: '学校通讯录（团队提供截图）',
    sourceUrl: '',
    verification: '具体接诊安排尚未核实'
  },

  {
    id: 'zhuhai-wildlife',
    category: '珠海野生动物保护联系',
    name:
      '珠海市自然资源监测中心（珠海市陆生野生动植物保护中心）',
    phone: '0756-2251100',
    otherPhones: '',
    description:
      '公开报道列出的野生动物保护举报渠道。可咨询救护受理及转介流程，尚未确认是否直接受理赤花山动物救护。',
    serviceTime: '服务时间待确认',
    source: '凤凰网广东2025年7月8日报道',
    sourceUrl: 'https://gd.ifeng.com/c/8kocAEKvbzm',
    verification: '救护受理范围尚未核实'
  },

  {
    id: 'zhuhai-gaoxin',
    category: '属地部门咨询',
    name: '珠海市自然资源局高新分局',
    phone: '0756-3389307',
    otherPhones: '',
    description:
      '公开报道列出的野生动物保护举报渠道。可咨询属地负责部门，是否负责赤花山具体点位及救护流程待确认。',
    serviceTime: '服务时间待确认',
    source: '凤凰网广东2025年7月8日报道',
    sourceUrl: 'https://gd.ifeng.com/c/8kocAEKvbzm',
    verification: '具体负责区域及救护流程尚未核实'
  }
]

module.exports = {
  rescueContacts
}

const rescueGuideGroups = [
  {
    speciesIds: [1, 2, 3],
    title: '小型野生哺乳动物应对提示',
    tips: [
      '保持距离，不触摸、追赶、围堵或自行捕捉。',
      '不随意投喂，不带回宿舍或家中饲养。',
      '发现明显受伤、被困或活动异常时，联系野生动物相关部门，按专业人员指引处理。'
    ],
    source: '林草部门公众指引',
    sourceUrl: 'https://yncxym.gov.cn/info/1041/280217.htm'
  },

  {
    speciesIds: [4],
    title: '野猪应对提示',
    tips: [
      '保持冷静，不主动靠近、投喂或触摸，包括幼猪。',
      '不投掷物品、不追赶，也不围堵或阻挡其去路。',
      '必要时利用坚固障碍物隔开，待其离开后再通行。',
      '不自行抓捕或搬运受伤野猪，应联系专业人员。'
    ],
    source: '香港渔农自然护理署安全指引',
    sourceUrl: 'https://www.afcd.gov.hk/tc_chi/conservation/con_fau/con_fau_nui/con_fau_nui_pig/con_fau_nui_pig.html'
  },

  {
    speciesIds: [5, 7, 8],
    title: '猛禽应对提示',
    tips: [
      '不徒手抓握，不拉扯或提拎翅膀。',
      '不围观、不靠近拍照，减少惊扰。',
      '发现明显外伤、被缠绕或疑似受伤无法飞行时，联系专业救护人员。',
      '幼鸟落在地面不一定需要救援，不要仅凭不会飞就带走；无法判断时先咨询专业人员。'
    ],
    source: '国家林草局、深圳市规划和自然资源局公众指引',
    sourceUrl: 'https://www.forestry.gov.cn/c/www/lcdt/542228.jhtml',
    additionalSourceUrl: 'https://www.sz.gov.cn/szzt2010/wgkzl/glgxxgk/gtzy/content/post_10670785.html'
  },

  {
    speciesIds: [6, 9, 10, 11, 12],
    title: '野生鸟类应对提示',
    tips: [
      '保持距离，不追赶或自行捉拿。',
      '不随意喂食，不强行喂水。',
      '羽毛基本长齐、能蹦跳且无明显外伤的幼鸟，可能正在学飞，不要盲目带走。',
      '如有出血、明显外伤、被缠绕或遭猫狗攻击，应联系专业人员。'
    ],
    source: '广州市林业和园林局公众指引',
    sourceUrl: 'https://lyylj.gz.gov.cn/zmhd/cjwt/dzwbh/content/post_10909126.html'
  }
]

function getRescueGuideBySpeciesId(speciesId) {
  const id = Number(speciesId)

  return rescueGuideGroups.find(
    group => group.speciesIds.includes(id)
  ) || null
}

module.exports.getRescueGuideBySpeciesId =
  getRescueGuideBySpeciesId