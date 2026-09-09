const {
  getSpeciesByName
} = require('../../data/species.js')


Page({

  data: {
    observation: null,
    species: null
  },


  onLoad(options) {

    const id =
      Number(options.id)


    if (!id) {

      wx.showToast({
        title: '观察记录不存在',
        icon: 'none'
      })

      return

    }


    this.loadObservation(id)

  },


  // 读取当前 Observation
  loadObservation(id) {

    const observations =
      wx.getStorageSync('observations') || []


    const observation =
      observations.find(
        item =>
          Number(item.id) ===
          Number(id)
      )


    if (!observation) {

      wx.showModal({
        title: '记录不存在',
        content: '没有找到这条观察记录。',
        showCancel: false,

        success: () => {
          wx.navigateBack()
        }
      })

      return

    }


    const species =
      getSpeciesByName(
        observation.speciesName
      )


    this.setData({
      observation,
      species: species || null
    })


    wx.setNavigationBarTitle({
      title:
        `${observation.speciesName} · 观察记录`
    })

  },


  // 查看 Species 物种详情
  goToSpeciesDetail() {

    const observation =
      this.data.observation


    if (!observation) {
      return
    }


    wx.navigateTo({
      url:
        `/pages/species/species?name=${encodeURIComponent(
          observation.speciesName
        )}`
    })

  },


  // 删除观察记录
  deleteObservation() {

    const observation =
      this.data.observation


    if (!observation) {

      wx.showToast({
        title: '记录不存在',
        icon: 'none'
      })

      return

    }


    wx.showModal({

      title: '删除观察记录',

      content:
        `确定删除这次“${observation.speciesName}”观察吗？删除后无法恢复。`,

      confirmText: '删除',

      cancelText: '取消',

      confirmColor: '#d9534f',


      success: (res) => {

        if (!res.confirm) {
          return
        }


        // 读取所有 Observation
        const observations =
          wx.getStorageSync('observations') || []


        // 删除当前这一条
        const newObservations =
          observations.filter(
            item =>
              Number(item.id) !==
              Number(observation.id)
          )


        // 保存删除后的数据
        wx.setStorageSync(
          'observations',
          newObservations
        )


        // 同时删除这条 Observation 对应的社区互动
        const interactions =
          wx.getStorageSync('interactions') || {}


        const interactionId =
          String(observation.id)


        if (interactions[interactionId]) {

          delete interactions[
            interactionId
          ]


          wx.setStorageSync(
            'interactions',
            interactions
          )

        }


        console.log(
          '已删除 Observation：',
          observation
        )


        wx.showToast({
          title: '已删除',
          icon: 'success',
          duration: 1000
        })


        // 稍微等待 Toast 显示后返回
        setTimeout(() => {

          wx.navigateBack()

        }, 800)

      }

    })

  }

})