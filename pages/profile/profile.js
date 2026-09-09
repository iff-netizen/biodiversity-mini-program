const {
  speciesList,
  getSpeciesByName
} = require('../../data/species.js')


Page({

  data: {
    observationCount: 0,
    speciesCount: 0,
    contributionCount: 0,

    totalSpecies: 12,

    progressPercent: 0,
    progressWidth: "0%",

    level: 1,
    levelName: "自然新朋友",

    recentObservations: []
  },


  onShow() {
    this.loadUserData()
  },


  loadUserData() {

    // 读取所有观察记录
    const observations =
      wx.getStorageSync('observations') || []


    // 找出已经发现过的正式物种
    const discoveredSpecies = [
      ...new Set(
        observations
          .map(item => item.speciesName)
          .filter(name => getSpeciesByName(name))
      )
    ]


    // 观察次数
    const observationCount =
      observations.length


    // 发现了多少种不同物种
    const speciesCount =
      discoveredSpecies.length


    // 当前版本：
    // 每一条观察记录都算作一次有效贡献
    const contributionCount =
      observations.length


    // 图鉴完成百分比
    const progressPercent =
      speciesList.length > 0
        ? Math.round(
            speciesCount /
            speciesList.length *
            100
          )
        : 0


    // 给 WXML 进度条使用
    const progressWidth =
      `${progressPercent}%`


    // 计算贡献等级
    const levelInfo =
      this.calculateLevel(
        contributionCount
      )


    // 最近 5 条观察记录
    const recentObservations =
      observations
        .slice(0, 5)
        .map(item => {

          const species =
            getSpeciesByName(
              item.speciesName
            )

          return {
            ...item,

            emoji:
              species
                ? species.emoji
                : "🌿"
          }
        })


    // 更新页面
    this.setData({

      observationCount:
        observationCount,

      speciesCount:
        speciesCount,

      contributionCount:
        contributionCount,

      totalSpecies:
        speciesList.length,

      progressPercent:
        progressPercent,

      progressWidth:
        progressWidth,

      level:
        levelInfo.level,

      levelName:
        levelInfo.name,

      recentObservations:
        recentObservations

    })
  },


  // 计算贡献等级
  calculateLevel(count) {

    if (count >= 20) {
      return {
        level: 4,
        name: "自然守护者"
      }
    }


    if (count >= 10) {
      return {
        level: 3,
        name: "自然探索者"
      }
    }


    if (count >= 5) {
      return {
        level: 2,
        name: "自然观察员"
      }
    }


    return {
      level: 1,
      name: "自然新朋友"
    }
  },


  // 点击最近观察
  // 进入对应的 Observation 详情页
  goToObservationDetail(e) {

    const id =
      e.currentTarget.dataset.id


    if (!id) {

      wx.showToast({
        title: "观察记录不存在",
        icon: "none"
      })

      return
    }


    wx.navigateTo({

      url:
        `/pages/observation/observation?id=${id}`

    })

  },


  // 查看完整图鉴
  goToCollection() {

    wx.switchTab({

      url:
        '/pages/collection/collection'

    })

  }

})