const speciesList = [
  {
    id: 1,
    name: "小灵猫",
    englishName: "Small Indian Civet",
    scientificName: "Viverricula indica",
    nationalProtection: "一级",
    redList: "", // 待核对，暂沿用原值
    iucn: "无危", // 待核对，暂沿用原值
    emoji: "🐾",
    description: "小灵猫是灵猫科的小型食肉目哺乳动物。体毛呈黄褐色至棕褐色，体侧散布深色斑点，背部斑纹常连成纵向条带，尾部具有黑白相间的环纹。识别时可重点观察颈部黑白纹、背部纵纹和环纹长尾，其背部没有明显的长毛鬣。",
    habitat: "",
    habits: "主要在夜间活动，白天多在隐蔽处休息。通常独居，以地面活动为主，也具有攀爬能力。主要捕食鼠类等小型脊椎动物，也取食昆虫、果实和腐肉。",
    image: ""
  },
  {
    id: 2,
    name: "豹猫",
    englishName: "Leopard Cat",
    scientificName: "Prionailurus bengalensis",
    nationalProtection: "二级",
    redList: "易危", // 待核对，暂沿用原值
    iucn: "无危", // 待核对，暂沿用原值
    emoji: "🐆",
    description: "豹猫是猫科的小型食肉目哺乳动物。身体修长，头部较圆、耳端圆钝，体毛多呈黄褐色或灰褐色，腹面较浅，躯干和四肢分布深色斑点。识别时可重点观察面部深色条纹、耳背中央白斑及带斑纹的尾部，毛色和斑纹会因地区而有所变化。",
    habitat: "",
    habits: "主要在夜间和晨昏活动，部分地区也有白天活动的记录。通常独居，善于攀爬和游泳，可在地面及树上捕猎。主要捕食鼠类等小型动物，也取食鸟类、爬行类、两栖类和昆虫，食物组成随地区而变化。",
    image: ""
  },
  {
    id: 3,
    name: "花面狸",
    englishName: "Masked Palm Civet",
    scientificName: "Paguma larvata",
    nationalProtection: "未列入",
    redList: "", // 待核对，暂沿用原值
    iucn: "无危", // 待核对，暂沿用原值
    emoji: "🐾",
    description: "花面狸又称果子狸，是灵猫科的食肉目哺乳动物。身体被灰色至灰褐色毛，四足颜色较深，尾部细长，体躯和尾部通常没有明显的斑点或环纹。识别时可重点观察额部沿鼻梁延伸的白色纵纹，以及眼周黑白相间、近似面罩的脸部花纹。",
    habitat: "",
    habits: "主要在夜间活动，白天常在树上隐蔽处休息。通常独居，善于攀爬，常在树上活动和觅食。食性杂，以果实为重要食物来源，也取食昆虫、鸟类及其他小型脊椎动物。",
    image: ""
  },
  {
    id: 4,
    name: "野猪",
    englishName: "Wild Boar",
    scientificName: "Sus scrofa",
    nationalProtection: "未列入",
    redList: "", // 待核对，暂沿用原值
    iucn: "无危", // 待核对，暂沿用原值
    emoji: "🐗",
    description: "野猪是猪科的偶蹄类哺乳动物。体躯粗壮，头部较长，吻端形成明显的鼻盘，全身覆盖粗硬毛，背部鬃毛较长，成体毛色多为棕褐色或灰黑色。识别时可重点观察突出的长吻和粗壮体形，成年雄性獠牙较明显，幼仔常具有浅色纵向条纹。",
    habitat: "",
    habits: "昼夜均可活动，常在傍晚和夜间觅食，活动时间受环境影响。雌性与幼仔多结群，成年雄性常独居，并有泥浴行为。食性杂，以果实、种子、根茎等植物性食物为主，也取食昆虫、小型动物和腐肉。",
    image: ""
  },
  {
    id: 5,
    name: "蛇雕",
    englishName: "Crested Serpent",
    scientificName: "Spilornis cheela",
    nationalProtection: "二级",
    redList: "", // 待核对，暂沿用原值
    iucn: "", // 待核对，暂沿用原值
    emoji: "🦅",
    description: "蛇雕是鹰科的中大型猛禽。成鸟全身以褐色为主，头顶及后部短冠羽较深，腹部和体侧散布白色斑点，双翼宽大且翼端较圆。识别时可重点观察飞行中翼下醒目的浅色宽带，以及滑翔时略向上抬起的双翼；幼鸟翼下通常更浅，并带有深色横斑。",
    habitat: "",
    habits: "白天可见其盘旋活动，晴天常在山地上空飞翔并鸣叫。常停栖高处观察猎物，也沿山坡巡飞搜寻，有时成对活动。捕食蛇类及蛙类等动物，香港的观察记录以蛇类为主要猎物。",
    image: ""
  },
  {
    id: 6,
    name: "褐翅鸦鹃",
    englishName: "Common Coucal",
    scientificName: "Centropus sinensis",
    nationalProtection: "二级",
    redList: "", // 待核对，暂沿用原值
    iucn: "", // 待核对，暂沿用原值
    emoji: "🐦",
    description: "褐翅鸦鹃是杜鹃科的大型长尾鸟类。成鸟头部、躯干和尾部以黑色为主，并带蓝紫色光泽，背部和双翼呈栗褐色，虹膜呈红色至褐色。识别时可重点观察栗褐色双翼与黑色身体形成的鲜明对比，以及宽长的尾部；幼鸟则常带有浅色横斑。",
    habitat: "",
    habits: "主要在白天活动，清晨和傍晚较为活跃。常单独或成对出现，多在地面及浓密植被中行走、跳跃和搜寻食物。取食昆虫、蜗牛、蛙类、蜥蜴及其他小型动物，也有取食鸟卵、雏鸟和果实的记录。",
    image: ""
  },
  {
    id: 7,
    name: "领角鸮",
    englishName: "Collared Scops Owl",
    scientificName: "Otus lettia",
    nationalProtection: "二级",
    redList: "", // 待核对，暂沿用原值
    iucn: "", // 待核对，暂沿用原值
    emoji: "🦉",
    description: "领角鸮是鸱鸮科的小型鸮类。头大而体形紧凑，具有可竖起的明显耳羽簇，眼睛呈红褐色，体羽以褐色为主，混有深浅相间的斑纹。识别时可重点观察浅色面盘、深色面盘边缘和耳羽簇，其颈后浅黄褐色领纹通常并不十分醒目。",
    habitat: "",
    habits: "主要在夜间活动，白天多在隐蔽处栖息。行为隐秘，繁殖期常在夜间持续鸣叫，以叫声宣示领域。捕食昆虫及小型脊椎动物，已有鼠类、鼩鼱、鸟类和蛙类等食物记录。",
    image: ""
  },
  {
    id: 8,
    name: "斑头鸺鹠",
    englishName: "Asian Barred Owlet",
    scientificName: "Glaucidium cuculoides",
    nationalProtection: "二级",
    redList: "", // 待核对，暂沿用原值
    iucn: "", // 待核对，暂沿用原值
    emoji: "🦉",
    description: "斑头鸺鹠是鸱鸮科的小型鸮类。体形粗短，头部圆，无明显耳羽簇，眼睛呈黄色，头颈和背部为褐色并密布浅色横斑，腹部较浅且带褐色斑纹。识别时可重点观察圆头、黄色眼睛及密集横斑，其后脑不具领鸺鹠那样明显的假眼状图案。",
    habitat: "",
    habits: "昼夜均有活动记录，活动节律存在地区差异。常停栖于树冠中层或突出枝柱上，也会在树木之间作波状飞行。捕食小型鸟类、爬行类、两栖类及蝉等较大型昆虫。",
    image: ""
  },
  {
    id: 9,
    name: "画眉",
    englishName: "Chinese Hwamei",
    scientificName: "Garrulax canorus",
    nationalProtection: "二级",
    redList: "", // 待核对，暂沿用原值
    iucn: "", // 待核对，暂沿用原值
    emoji: "🐦",
    description: "画眉是噪鹛科的中型鸣禽。全身以棕褐色至栗褐色为主，头顶和胸部带细密深色纵纹，腹部偏灰，喙较粗壮且呈黄色，尾部较长。识别时可重点观察浅色眼圈及向眼后延伸的白色眉纹，这一醒目的眼周图案是其重要外形特征。",
    habitat: "",
    habits: "活动较隐蔽，常藏身于浓密植被中。可单独、成对或成小群觅食，常在地面跳跃并翻动落叶寻找食物。主要取食昆虫，也取食果实、种子和谷物。",
    image: ""
  },
  {
    id: 10,
    name: "红喉歌鸲",
    englishName: "Siberian Rubythroat",
    scientificName: "Calliope calliope",
    nationalProtection: "二级",
    redList: "", // 待核对，暂沿用原值
    iucn: "", // 待核对，暂沿用原值
    emoji: "🐦",
    description: "红喉歌鸲是鹟科的小型鸣禽。雄鸟具有鲜红色的颏部和喉部，白色眉纹与白色颊下纹明显，红喉下方常有窄黑带与灰色胸部分隔。识别时可重点观察喉部颜色和面部条纹，雌鸟喉部通常为白色至淡粉红色，部分个体也可带较明显的红色。",
    habitat: "",
    habits: "具有季节性迁徙习性，越冬期雄鸟可通过鸣声宣示领域。行为隐蔽，常在地面或低矮植被中搜寻食物，较难直接观察。以昆虫为主要食物。",
    image: ""
  },
  {
    id: 11,
    name: "黑冠鳽",
    englishName: "Malayan Night Heron",
    scientificName: "Gorsachius melanolophus",
    nationalProtection: "二级",
    redList: "", // 待核对，暂沿用原值
    iucn: "", // 待核对，暂沿用原值
    emoji: "🐦",
    description: "黑冠鳽是鹭科的中型鸟类。成鸟头顶及冠羽呈深灰至黑色，与栗褐色的头侧、背部和翅上羽毛形成对比，面部裸露皮肤呈蓝色。识别时可重点观察深色冠羽、栗褐色体羽和初级飞羽的白色羽端；幼鸟身上则具有较密集的浅色斑点和横斑。",
    habitat: "",
    habits: "晨昏和夜间有活动记录，白天也可见其觅食。通常单独活动，常在地面缓慢行走或静立观察，发现猎物后迅速啄取。取食蚯蚓、昆虫、蛙类等动物，食物组成可因地区而异。",
    image: ""
  },
  {
    id: 12,
    name: "仙八色鸫",
    englishName: "Fairy Pitta",
    scientificName: "Pitta nympha",
    nationalProtection: "二级",
    redList: "", // 待核对，暂沿用原值
    iucn: "", // 待核对，暂沿用原值
    emoji: "🐦",
    description: "仙八色鸫是八色鸫科的小型鸟类。头顶栗褐色，眉纹淡黄，眼部有宽黑纹，喉部白色，背部绿色，翅上具亮蓝色斑块，腹部中央及尾下覆羽呈鲜红色。识别时可重点观察头部黑、褐、黄相间的纹路，以及绿色背部、蓝色翼斑和红色下腹形成的多彩组合。",
    habitat: "",
    habits: "具有季节性迁徙习性，行为隐蔽，繁殖期会发出响亮鸣声。常单独在林下地面活动，通过跳跃、翻动落叶或以喙掘土寻找食物。主要取食蚯蚓、昆虫及其幼虫，也取食蜈蚣和螺类等无脊椎动物。",
    image: ""
  }
]

function getSpeciesByName(name) {
  return speciesList.find(
    item => item.name === name
  )
}

function getSpeciesById(id) {
  return speciesList.find(
    item => item.id === id
  )
}

module.exports = {
  speciesList,
  getSpeciesByName,
  getSpeciesById
}
