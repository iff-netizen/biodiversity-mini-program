const speciesList = [
  {
    id: 1,
    name: "小灵猫",
    englishName: "Small Indian Civet",
    scientificName: "Viverricula indica",
    nationalProtection: "一级",
    redList: "",
    iucn: "无危",
    emoji: "🐾"
  },

  {
    id: 2,
    name: "豹猫",
    englishName: "Leopard Cat",
    scientificName: "Prionailurus bengalensis",
    nationalProtection: "二级",
    redList: "易危",
    iucn: "无危",
    emoji: "🐆"
  },

  {
    id: 3,
    name: "花面狸",
    englishName: "Masked Palm Civet",
    scientificName: "Paguma larvata",
    nationalProtection: "",
    redList: "",
    iucn: "无危",
    emoji: "🐾"
  },

  {
    id: 4,
    name: "野猪",
    englishName: "Wild Boar",
    scientificName: "Sus scrofa",
    nationalProtection: "",
    redList: "",
    iucn: "无危",
    emoji: "🐗"
  },

  {
    id: 5,
    name: "蛇雕",
    englishName: "Crested Serpent Eagle",
    scientificName: "Spilornis cheela",
    nationalProtection: "二级",
    redList: "",
    iucn: "",
    emoji: "🦅"
  },

  {
    id: 6,
    name: "褐翅鸦鹃",
    englishName: "Greater Coucal",
    scientificName: "Centropus sinensis",
    nationalProtection: "二级",
    redList: "",
    iucn: "",
    emoji: "🐦"
  },

  {
    id: 7,
    name: "领角鸮",
    englishName: "Collared Scops Owl",
    scientificName: "Otus lettia",
    nationalProtection: "二级",
    redList: "",
    iucn: "",
    emoji: "🦉"
  },

  {
    id: 8,
    name: "斑头鸺鹠",
    englishName: "Asian Barred Owlet",
    scientificName: "Glaucidium cuculoides",
    nationalProtection: "二级",
    redList: "",
    iucn: "",
    emoji: "🦉"
  },

  {
    id: 9,
    name: "画眉",
    englishName: "Chinese Hwamei",
    scientificName: "Garrulax canorus",
    nationalProtection: "二级",
    redList: "",
    iucn: "",
    emoji: "🐦"
  },

  {
    id: 10,
    name: "红喉歌鸲",
    englishName: "Siberian Rubythroat",
    scientificName: "Calliope calliope",
    nationalProtection: "二级",
    redList: "",
    iucn: "",
    emoji: "🐦"
  },

  {
    id: 11,
    name: "黑冠鳽",
    englishName: "Malay Night-heron",
    scientificName: "Gorsachius melanolophus",
    nationalProtection: "二级",
    redList: "",
    iucn: "",
    emoji: "🐦"
  },

  {
    id: 12,
    name: "仙八色鸫",
    englishName: "Fairy Pitta",
    scientificName: "Pitta nympha",
    nationalProtection: "二级",
    redList: "",
    iucn: "",
    emoji: "🐦"
  }
]

function getSpeciesByName(name) {
  return speciesList.find(
    item => item.name === name
  )
}

module.exports = {
  speciesList,
  getSpeciesByName
}