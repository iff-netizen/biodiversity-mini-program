const {
  speciesList
} = require('../../data/species.js')


Page({
  data: {
    animals: [],
    unlockedCount: 0
  },


  onShow() {
    this.updateCollection()
  },


  updateCollection() {

    // 获取用户已经保存的观察记录
    const observations =
      wx.getStorageSync('observations') || []


    // 获取已经观察过的物种名称
    const unlockedSpecies =
      observations.map(
        item => item.speciesName
      )


    // 将正式物种数据库和观察记录结合
    const animals =
      speciesList.map(
        species => {

          return {
            ...species,

            unlocked:
              unlockedSpecies.includes(
                species.name
              )
          }
        }
      )


    // 计算解锁数量
    const unlockedCount =
      animals.filter(
        animal => animal.unlocked
      ).length


    this.setData({
      animals,
      unlockedCount
    })
  },


  // 点击已经解锁的物种
  goToSpecies(e) {

    const name =
      e.currentTarget.dataset.name


    const unlocked =
      e.currentTarget.dataset.unlocked


    if (!unlocked) {

      wx.showToast({
        title: '还没有发现这个物种',
        icon: 'none'
      })

      return
    }


    wx.navigateTo({
      url:
        `/pages/species/species?name=${encodeURIComponent(name)}`
    })
  }
})