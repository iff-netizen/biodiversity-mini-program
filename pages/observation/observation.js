const community = require('../../services/community')
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
      options.id == null ? '' : String(options.id)


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
          String(item.id) ===
          String(id)
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
  shareObservation() {
    if (this.data.observation) community.shareObservation(this.data.observation)
  },

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
        `删除这次“${observation.speciesName}”本机观察及其本机互动${community.hasShares(observation.id) ? '，并删除本机曾分享的开发身份下关联动态、取消任务及撤回记忆引用。需要本地服务连接成功' : ''}。删除后无法恢复。`,

      confirmText: '删除',

      cancelText: '取消',

      confirmColor: '#d9534f',


      success: async (res) => {

        if (!res.confirm) {
          return
        }

        try {
          if (community.hasShares(observation.id)) await community.deleteLinkedPosts(observation.id)
        } catch (error) {
          wx.showModal({ title: '关联动态尚未全部删除', content: '个人观察仍保留，请连接本地服务后重试。已成功删除的动态不会恢复。', showCancel: false })
          return
        }


        // 读取所有 Observation
        const observations =
          wx.getStorageSync('observations') || []


        // 删除当前这一条
        const newObservations =
          observations.filter(
            item =>
              String(item.id) !==
              String(observation.id)
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
