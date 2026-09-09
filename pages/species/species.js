const {
  getSpeciesByName
} = require('../../data/species.js')


Page({

  data: {

    // 物种基础资料
    species: null,

    // 这个物种的观察次数
    observationCount: 0,

    // 最近一次观察
    latestObservation: null,

    // 是否存在观察记录
    hasObservations: false

  },


  onLoad(options) {

    const name =
      decodeURIComponent(
        options.name || ''
      )


    // 从统一 Species 数据库中查找
    const species =
      getSpeciesByName(name)


    if (!species) {

      wx.showToast({
        title: '暂无该物种资料',
        icon: 'none'
      })

      return

    }


    this.setData({
      species
    })


    wx.setNavigationBarTitle({
      title: species.name
    })


    // 加载该物种的观察数据
    this.loadObservationData(
      species.name
    )

  },


  // 每次重新回到页面时刷新
  onShow() {

    if (this.data.species) {

      this.loadObservationData(
        this.data.species.name
      )

    }

  },


  // 统计这个物种的 Observation
  loadObservationData(speciesName) {

    const observations =
      wx.getStorageSync('observations') || []


    // 找出属于这个物种的所有观察
    const speciesObservations =
      observations.filter(
        item =>
          item.speciesName === speciesName
      )


    const observationCount =
      speciesObservations.length


    // 因为我们保存 Observation 时使用的是 unshift
    // 所以数组前面的记录通常就是最新记录
    const latestObservation =
      speciesObservations.length > 0
        ? speciesObservations[0]
        : null


    this.setData({

      observationCount,

      latestObservation,

      hasObservations:
        observationCount > 0

    })

  },


  // 查看最近一次观察
  goToLatestObservation() {

    const observation =
      this.data.latestObservation


    if (!observation) {
      return
    }


    wx.navigateTo({

      url:
        `/pages/observation/observation?id=${observation.id}`

    })

  },


  // 我也发现了它
  reportObservation() {

    wx.switchTab({

      url:
        '/pages/identify/identify'

    })

  }

})